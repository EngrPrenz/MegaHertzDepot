import { HybridLogicalClock } from './hlc.js';
import {
  Product,
  Adjustment,
} from './types/index.js';
import {
  ProductCreatePayload,
  ProductUpdatePayload,
  ProductDeletePayload,
  AdjustmentCreatePayload,
} from './schemas/sync.js';

/**
 * Maximum allowed physical clock drift into the future (5 minutes in ms).
 * Mitigates the "wrong client clock wins forever" problem (Section 7).
 */
export const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000;

/**
 * Clamps a client HLC string if its physical millisecond component is more than
 * MAX_CLOCK_DRIFT_MS ahead of the server's reference physical time.
 */
export function clampHlc(
  clientHlcString: string,
  serverPhysicalTime: number = Date.now(),
  maxDriftMs: number = MAX_CLOCK_DRIFT_MS
): string {
  const parsed = HybridLogicalClock.parse(clientHlcString);
  const maxAllowedMillis = serverPhysicalTime + maxDriftMs;

  if (parsed.millis > maxAllowedMillis) {
    return HybridLogicalClock.format({
      millis: maxAllowedMillis,
      counter: parsed.counter,
      nodeId: parsed.nodeId,
    });
  }
  return clientHlcString;
}

/**
 * Resolves a product creation or upsert against an existing product record (if any).
 * Rules (Section 7):
 * - Tombstone (delete) wins over concurrent or subsequent edits/creates.
 * - Per-field Last-Write-Wins (LWW) using HLC comparison (which tie-breaks on nodeId/deviceId).
 */
export function mergeProductCreate(
  existing: Product | undefined,
  incoming: ProductCreatePayload,
  serverPhysicalTime?: number
): { product: Product; changed: boolean } {
  const incomingNameHlc = serverPhysicalTime
    ? clampHlc(incoming.nameHlc, serverPhysicalTime)
    : incoming.nameHlc;
  const incomingSkuHlc =
    incoming.skuHlc && serverPhysicalTime
      ? clampHlc(incoming.skuHlc, serverPhysicalTime)
      : incoming.skuHlc ?? incomingNameHlc;
  const incomingPriceHlc =
    incoming.priceHlc && serverPhysicalTime
      ? clampHlc(incoming.priceHlc, serverPhysicalTime)
      : incoming.priceHlc ?? incomingNameHlc;
  const incomingImageHlc =
    incoming.imageHlc && serverPhysicalTime
      ? clampHlc(incoming.imageHlc, serverPhysicalTime)
      : incoming.imageHlc ?? incomingNameHlc;

  if (!existing) {
    return {
      product: {
        id: incoming.id,
        storeId: incoming.storeId,
        name: incoming.name,
        sku: incoming.sku ?? null,
        category: incoming.category ?? 'Peripheral',
        brand: incoming.brand ?? null,
        price: incoming.price ?? 0,
        costPrice: incoming.costPrice ?? null,
        warranty: incoming.warranty ?? '1 Year Store Warranty',
        specs: incoming.specs ?? null,
        imageUrl: incoming.imageUrl ?? null,
        nameHlc: incomingNameHlc,
        skuHlc: incomingSkuHlc,
        priceHlc: incomingPriceHlc,
        imageHlc: incomingImageHlc,
        deletedAt: null,
        deletedHlc: null,
      },
      changed: true,
    };
  }

  // Rule: Delete wins over concurrent edit/create
  if (existing.deletedAt || existing.deletedHlc) {
    return { product: existing, changed: false };
  }

  let changed = false;
  const updated: Product = { ...existing };

  if (HybridLogicalClock.compare(incomingNameHlc, existing.nameHlc) > 0) {
    updated.name = incoming.name;
    if (incoming.category !== undefined) updated.category = incoming.category;
    if (incoming.brand !== undefined) updated.brand = incoming.brand;
    if (incoming.warranty !== undefined) updated.warranty = incoming.warranty;
    if (incoming.specs !== undefined) updated.specs = incoming.specs;
    updated.nameHlc = incomingNameHlc;
    changed = true;
  }

  if (incoming.sku !== undefined) {
    const currentSkuHlc = existing.skuHlc ?? existing.nameHlc;
    if (HybridLogicalClock.compare(incomingSkuHlc, currentSkuHlc) > 0) {
      updated.sku = incoming.sku;
      updated.skuHlc = incomingSkuHlc;
      changed = true;
    }
  }

  if (incoming.price !== undefined) {
    const currentPriceHlc = existing.priceHlc ?? existing.nameHlc;
    if (HybridLogicalClock.compare(incomingPriceHlc, currentPriceHlc) > 0) {
      updated.price = incoming.price;
      if (incoming.costPrice !== undefined) updated.costPrice = incoming.costPrice;
      updated.priceHlc = incomingPriceHlc;
      changed = true;
    }
  }

  if (incoming.imageUrl !== undefined) {
    const currentImageHlc = existing.imageHlc ?? existing.nameHlc;
    if (HybridLogicalClock.compare(incomingImageHlc, currentImageHlc) > 0) {
      updated.imageUrl = incoming.imageUrl;
      updated.imageHlc = incomingImageHlc;
      changed = true;
    }
  }

  return { product: updated, changed };
}

/**
 * Resolves a per-field product update against an existing product record.
 * Rules (Section 7):
 * - Delete wins over concurrent edit: if product is already tombstoned, ignore edits.
 * - Per-field LWW on `name`/metadata (`nameHlc`), `sku` (`skuHlc`), and `price` (`priceHlc`).
 */
export function mergeProductUpdate(
  existing: Product,
  incoming: ProductUpdatePayload,
  fallbackHlc: string,
  serverPhysicalTime?: number
): { product: Product; changed: boolean } {
  // Rule: Delete wins over concurrent edit
  if (existing.deletedAt || existing.deletedHlc) {
    return { product: existing, changed: false };
  }

  let changed = false;
  const updated: Product = { ...existing };

  if (
    incoming.name !== undefined ||
    incoming.category !== undefined ||
    incoming.brand !== undefined ||
    incoming.warranty !== undefined ||
    incoming.specs !== undefined
  ) {
    const rawNameHlc = incoming.nameHlc ?? fallbackHlc;
    const incomingNameHlc = serverPhysicalTime
      ? clampHlc(rawNameHlc, serverPhysicalTime)
      : rawNameHlc;

    if (HybridLogicalClock.compare(incomingNameHlc, existing.nameHlc) > 0) {
      if (incoming.name !== undefined) updated.name = incoming.name;
      if (incoming.category !== undefined) updated.category = incoming.category;
      if (incoming.brand !== undefined) updated.brand = incoming.brand;
      if (incoming.warranty !== undefined) updated.warranty = incoming.warranty;
      if (incoming.specs !== undefined) updated.specs = incoming.specs;
      updated.nameHlc = incomingNameHlc;
      changed = true;
    }
  }

  if (incoming.sku !== undefined) {
    const rawSkuHlc = incoming.skuHlc ?? incoming.nameHlc ?? fallbackHlc;
    const incomingSkuHlc = serverPhysicalTime
      ? clampHlc(rawSkuHlc, serverPhysicalTime)
      : rawSkuHlc;
    const currentSkuHlc = existing.skuHlc ?? existing.nameHlc;

    if (HybridLogicalClock.compare(incomingSkuHlc, currentSkuHlc) > 0) {
      updated.sku = incoming.sku;
      updated.skuHlc = incomingSkuHlc;
      changed = true;
    }
  }

  if (incoming.price !== undefined || incoming.costPrice !== undefined) {
    const rawPriceHlc = incoming.priceHlc ?? incoming.nameHlc ?? fallbackHlc;
    const incomingPriceHlc = serverPhysicalTime
      ? clampHlc(rawPriceHlc, serverPhysicalTime)
      : rawPriceHlc;
    const currentPriceHlc = existing.priceHlc ?? existing.nameHlc;

    if (HybridLogicalClock.compare(incomingPriceHlc, currentPriceHlc) > 0) {
      if (incoming.price !== undefined) updated.price = incoming.price;
      if (incoming.costPrice !== undefined) updated.costPrice = incoming.costPrice;
      updated.priceHlc = incomingPriceHlc;
      changed = true;
    }
  }

  if (incoming.imageUrl !== undefined) {
    const rawImageHlc = incoming.imageHlc ?? incoming.nameHlc ?? fallbackHlc;
    const incomingImageHlc = serverPhysicalTime
      ? clampHlc(rawImageHlc, serverPhysicalTime)
      : rawImageHlc;
    const currentImageHlc = existing.imageHlc ?? existing.nameHlc;

    if (HybridLogicalClock.compare(incomingImageHlc, currentImageHlc) > 0) {
      updated.imageUrl = incoming.imageUrl;
      updated.imageHlc = incomingImageHlc;
      changed = true;
    }
  }

  return { product: updated, changed };
}

/**
 * Resolves a product delete (tombstone) against an existing product record.
 */
export function mergeProductDelete(
  existing: Product,
  incoming: ProductDeletePayload,
  serverPhysicalTime?: number
): { product: Product; changed: boolean } {
  const incomingDeletedHlc = serverPhysicalTime
    ? clampHlc(incoming.deletedHlc, serverPhysicalTime)
    : incoming.deletedHlc;

  const incomingIso = new Date(incoming.deletedAt).toISOString();

  if (!existing.deletedAt || !existing.deletedHlc) {
    return {
      product: {
        ...existing,
        deletedAt: incomingIso,
        deletedHlc: incomingDeletedHlc,
      },
      changed: true,
    };
  }

  if (HybridLogicalClock.compare(incomingDeletedHlc, existing.deletedHlc) > 0) {
    return {
      product: {
        ...existing,
        deletedAt: incomingIso,
        deletedHlc: incomingDeletedHlc,
      },
      changed: true,
    };
  }

  return { product: existing, changed: false };
}

/**
 * Computes derived stock quantity from an append-only list of adjustments.
 * Commutative property: sum of deltas is order-independent.
 */
export function computeDerivedStock(
  adjustments: Pick<Adjustment, 'delta'>[]
): number {
  return adjustments.reduce((sum, adj) => sum + adj.delta, 0);
}

export interface CountDiscrepancyInfo {
  hasCount: boolean;
  countedPhysical?: number;
  countHlc?: string;
  countCreatedAt?: number;
  countDeviceId?: string;
  adjustedSinceCount: number;
  currentStock: number;
  discrepancyExists: boolean;
}

export function analyzeStockCountSemantics(
  adjustments: Adjustment[]
): CountDiscrepancyInfo {
  const currentStock = computeDerivedStock(adjustments);
  const countAdjustments = adjustments.filter(
    (a) => a.reason === 'count' && typeof a.countedPhysical === 'number'
  );

  if (countAdjustments.length === 0) {
    return {
      hasCount: false,
      adjustedSinceCount: 0,
      currentStock,
      discrepancyExists: false,
    };
  }

  const sortedCounts = [...countAdjustments].sort((a, b) =>
    HybridLogicalClock.compare(a.hlc, b.hlc)
  );
  const latestCount = sortedCounts[sortedCounts.length - 1];
  const countedPhysical = latestCount.countedPhysical!;
  const adjustedSinceCount = currentStock - countedPhysical;

  return {
    hasCount: true,
    countedPhysical,
    countHlc: latestCount.hlc,
    countCreatedAt: latestCount.createdAt,
    countDeviceId: latestCount.deviceId,
    adjustedSinceCount,
    currentStock,
    discrepancyExists: adjustedSinceCount !== 0,
  };
}

/**
 * Computes exponential backoff delay with full jitter for sync retries (Section 8).
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000,
  randomFn: () => number = Math.random
): number {
  const exp = Math.min(attempt, 10);
  const ceiling = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exp));
  const jitter = Math.floor(randomFn() * (ceiling * 0.3));
  return Math.min(maxDelayMs, Math.floor(ceiling * 0.7) + jitter);
}

/**
 * In-memory deterministic replica state used for headless convergence testing
 * and state verification across multiple offline devices.
 */
export class InMemorySyncReplica {
  public products = new Map<string, Product>();
  public adjustments = new Map<string, Adjustment>();

  public applyProductState(incoming: Product): void {
    const existing = this.products.get(incoming.id);
    if (!existing) {
      this.products.set(incoming.id, { ...incoming });
      return;
    }

    const updated: Product = { ...existing };

    if (incoming.deletedAt && incoming.deletedHlc) {
      if (
        !updated.deletedHlc ||
        HybridLogicalClock.compare(incoming.deletedHlc, updated.deletedHlc) > 0
      ) {
        updated.deletedAt = incoming.deletedAt;
        updated.deletedHlc = incoming.deletedHlc;
      }
    }

    if (!updated.deletedAt && !updated.deletedHlc) {
      if (HybridLogicalClock.compare(incoming.nameHlc, updated.nameHlc) > 0) {
        updated.name = incoming.name;
        updated.category = incoming.category ?? updated.category;
        updated.brand = incoming.brand ?? updated.brand;
        updated.warranty = incoming.warranty ?? updated.warranty;
        updated.specs = incoming.specs ?? updated.specs;
        updated.nameHlc = incoming.nameHlc;
      }
      const inSkuHlc = incoming.skuHlc ?? incoming.nameHlc;
      const curSkuHlc = updated.skuHlc ?? updated.nameHlc;
      if (HybridLogicalClock.compare(inSkuHlc, curSkuHlc) > 0) {
        updated.sku = incoming.sku;
        updated.skuHlc = incoming.skuHlc;
      }
      const inPriceHlc = incoming.priceHlc ?? incoming.nameHlc;
      const curPriceHlc = updated.priceHlc ?? updated.nameHlc;
      if (HybridLogicalClock.compare(inPriceHlc, curPriceHlc) > 0) {
        updated.price = incoming.price;
        updated.costPrice = incoming.costPrice;
        updated.priceHlc = incoming.priceHlc;
      }
    }

    if (
      incoming.updatedSeq !== undefined &&
      (updated.updatedSeq === undefined || incoming.updatedSeq > updated.updatedSeq)
    ) {
      updated.updatedSeq = incoming.updatedSeq;
    }

    this.products.set(updated.id, updated);
  }

  public applyAdjustment(incoming: AdjustmentCreatePayload & { userId: string }): void {
    if (this.adjustments.has(incoming.id)) {
      return;
    }
    this.adjustments.set(incoming.id, {
      id: incoming.id,
      productId: incoming.productId,
      storeId: incoming.storeId,
      delta: incoming.delta,
      reason: incoming.reason,
      countedPhysical: incoming.countedPhysical ?? null,
      localStockAtCount: incoming.localStockAtCount ?? null,
      createdAt: incoming.createdAt,
      hlc: incoming.hlc,
      deviceId: incoming.deviceId,
      userId: incoming.userId,
    });
  }

  public getStock(productId: string): number {
    let total = 0;
    for (const adj of this.adjustments.values()) {
      if (adj.productId === productId) {
        total += adj.delta;
      }
    }
    return total;
  }
}
