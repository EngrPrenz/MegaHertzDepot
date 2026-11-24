import {
  HybridLogicalClock,
  computeDerivedStock,
  HardwareCategory,
  HardwareSpecs,
} from '@countwise/shared';
import {
  AdjustmentLocal,
  CountwiseDatabase,
  ProductLocal,
  localDb,
} from '../db/index.js';
import { extractLocalImageId, isLocalImageUri } from './imageService.js';

export const DEFAULT_STORE_FALLBACK = '22222222-2222-2222-2222-222222222222';
export const PUBLIC_CATALOG_REFRESH_EVENT = 'megahertz-public-catalog-refresh';

/**
 * Resolves effective display stock for a product:
 * uses local adjustment deltas when present (staff terminal or local counts),
 * otherwise falls back to the last synced server-authoritative `publicStock`.
 */
export function resolveEffectiveStock(
  product: Pick<ProductLocal, 'publicStock'>,
  productAdjustments: AdjustmentLocal[]
): number {
  if (productAdjustments.length > 0) {
    return computeDerivedStock(productAdjustments);
  }
  if (typeof product.publicStock === 'number' && Number.isFinite(product.publicStock)) {
    return product.publicStock;
  }
  return 0;
}

interface RemoteCatalogProduct {
  id: string;
  storeId?: string;
  name: string;
  sku?: string | null;
  category?: HardwareCategory;
  brand?: string | null;
  price?: number;
  warranty?: string | null;
  specs?: HardwareSpecs | null;
  imageUrl?: string | null;
  nameHlc?: string;
  skuHlc?: string | null;
  priceHlc?: string | null;
  imageHlc?: string | null;
  stock?: number;
}

/**
 * Fetches `/public/catalog` and merges product metadata + `publicStock` into IndexedDB
 * so all customer views (Storefront, PC Rig Builder, Product Details) show accurate stock
 * across devices and offline cold starts.
 */
export async function syncPublicCatalog(
  storeId: string,
  options?: {
    allowAutoResolve?: boolean;
    onResolvePublicStoreId?: (resolvedStoreId: string) => void;
    db?: CountwiseDatabase;
  }
): Promise<{ storeId: string; productsCount: number } | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  const db = options?.db ?? localDb;
  const queriedSpecificStore = storeId !== DEFAULT_STORE_FALLBACK;
  const endpoint = queriedSpecificStore
    ? `/public/catalog?storeId=${encodeURIComponent(storeId)}`
    : '/public/catalog';

  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    let data = await res.json();

    if (
      options?.allowAutoResolve &&
      queriedSpecificStore &&
      Array.isArray(data?.products) &&
      data.products.length === 0
    ) {
      const fallbackRes = await fetch('/public/catalog');
      if (fallbackRes.ok) {
        data = await fallbackRes.json();
      }
    }

    const resolvedStoreId =
      typeof data?.storeId === 'string' && data.storeId ? data.storeId : storeId;

    if (
      typeof data?.storeId === 'string' &&
      data.storeId !== storeId &&
      options?.onResolvePublicStoreId
    ) {
      options.onResolvePublicStoreId(data.storeId);
    }

    if (!Array.isArray(data?.products)) {
      return { storeId: resolvedStoreId, productsCount: 0 };
    }

    const remoteProducts = data.products as RemoteCatalogProduct[];

    await db.transaction('rw', [db.products, db.productImages], async () => {
      for (const remote of remoteProducts) {
        if (!remote?.id || !remote?.name) continue;
        const nextPublicStock = Number(remote.stock ?? 0);
        const existing = await db.products.get(remote.id);

        if (!existing) {
          await db.products.put({
            id: remote.id,
            storeId: remote.storeId || resolvedStoreId,
            name: remote.name,
            sku: remote.sku ?? undefined,
            category: remote.category || 'Peripheral',
            brand: remote.brand ?? undefined,
            price: Number(remote.price ?? 0),
            warranty: remote.warranty ?? undefined,
            specs: remote.specs ?? undefined,
            imageUrl: remote.imageUrl ?? undefined,
            publicStock: nextPublicStock,
            nameHlc: remote.nameHlc || '000000000000000:000000:server',
            skuHlc: remote.skuHlc ?? undefined,
            priceHlc: remote.priceHlc ?? undefined,
            imageHlc: remote.imageHlc ?? undefined,
          });
        } else if (!existing.deletedAt) {
          const merged: ProductLocal = { ...existing };
          let changed = false;

          if (
            remote.nameHlc &&
            (!existing.nameHlc ||
              HybridLogicalClock.compare(remote.nameHlc, existing.nameHlc) > 0)
          ) {
            merged.name = remote.name;
            merged.category = remote.category || merged.category;
            merged.brand = remote.brand ?? undefined;
            merged.warranty = remote.warranty ?? undefined;
            merged.specs = remote.specs ?? undefined;
            merged.nameHlc = remote.nameHlc;
            changed = true;
          }

          if (
            remote.skuHlc &&
            (!existing.skuHlc || HybridLogicalClock.compare(remote.skuHlc, existing.skuHlc) > 0)
          ) {
            merged.sku = remote.sku ?? undefined;
            merged.skuHlc = remote.skuHlc;
            changed = true;
          }

          if (
            remote.priceHlc &&
            (!existing.priceHlc ||
              HybridLogicalClock.compare(remote.priceHlc, existing.priceHlc) > 0)
          ) {
            merged.price = Number(remote.price ?? merged.price ?? 0);
            merged.priceHlc = remote.priceHlc;
            changed = true;
          }

          if (
            remote.imageHlc &&
            (!existing.imageHlc ||
              HybridLogicalClock.compare(remote.imageHlc, existing.imageHlc) > 0)
          ) {
            merged.imageUrl = remote.imageUrl ?? undefined;
            merged.imageHlc = remote.imageHlc;
            changed = true;
          }

          if (existing.publicStock !== nextPublicStock) {
            merged.publicStock = nextPublicStock;
            changed = true;
          }

          // Heal stale device-local image pointers if missing on this device
          if (
            merged.imageUrl &&
            isLocalImageUri(merged.imageUrl) &&
            remote.imageUrl &&
            !isLocalImageUri(remote.imageUrl)
          ) {
            const localImg = await db.productImages.get(extractLocalImageId(merged.imageUrl));
            if (!localImg) {
              merged.imageUrl = remote.imageUrl;
              changed = true;
            }
          } else if (!merged.imageUrl && remote.imageUrl) {
            merged.imageUrl = remote.imageUrl;
            changed = true;
          }

          if (changed) {
            await db.products.put(merged);
          }
        }
      }
    });

    return { storeId: resolvedStoreId, productsCount: remoteProducts.length };
  } catch {
    // Offline or network error: retain local Dexie catalog silently
    return null;
  }
}

/**
 * Optimistically decrements cached `publicStock` in IndexedDB after a storefront order
 * and notifies listeners to refresh from `/public/catalog`.
 */
export async function decrementCachedPublicStock(
  items: Array<{ productId: string; quantity: number }>,
  db: CountwiseDatabase = localDb
): Promise<void> {
  if (items.length === 0) return;

  await db.transaction('rw', [db.products], async () => {
    for (const item of items) {
      if (!item.productId || !Number.isFinite(item.quantity)) continue;
      const existing = await db.products.get(item.productId);
      if (existing && typeof existing.publicStock === 'number') {
        await db.products.put({
          ...existing,
          publicStock: Math.max(0, existing.publicStock - item.quantity),
        });
      }
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PUBLIC_CATALOG_REFRESH_EVENT));
  }
}
