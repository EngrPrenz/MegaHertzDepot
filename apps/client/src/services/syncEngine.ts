import {
  SyncPushRequest,
  SyncPushResponse,
  SyncPullQuery,
  SyncPullResponse,
  HybridLogicalClock,
  computeBackoffDelay,
  getDefaultCatalogImageUrl,
} from '@countwise/shared';
import {
  CountwiseDatabase,
  localDb,
  ProductLocal,
  AdjustmentLocal,
  SaleOrderLocal,
  OutboxMutation,
} from '../db/index.js';
import { LocalFirstRepository, localRepository } from './localRepository.js';

function generateMutationUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface SyncTransport {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
  pull(query: SyncPullQuery): Promise<SyncPullResponse>;
}

export interface SyncStatusSnapshot {
  state: 'offline' | 'syncing' | 'synced' | 'error';
  lastSyncAt: number | null;
  lastPulledSeq: number;
  lastError: string | null;
  authRequired: boolean;
  consecutiveFailures: number;
}

export class HttpSyncTransport implements SyncTransport {
  private onTokenRefreshed?: (newToken: string) => void;
  private onAuthFailed?: () => void;

  constructor(callbacks?: {
    onTokenRefreshed?: (newToken: string) => void;
    onAuthFailed?: () => void;
  }) {
    this.onTokenRefreshed = callbacks?.onTokenRefreshed;
    this.onAuthFailed = callbacks?.onAuthFailed;
  }

  private async fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
    const token = localStorage.getItem('countwise_token');
    const headers = new Headers(init.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');

    let response = await fetch(url, { ...init, headers });

    // Silent token refresh on 401 (Section 9)
    if (response.status === 401) {
      const refreshToken = localStorage.getItem('countwise_refresh_token');
      if (refreshToken) {
        try {
          const refreshRes = await fetch('/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.accessToken) {
              localStorage.setItem('countwise_token', data.accessToken);
              this.onTokenRefreshed?.(data.accessToken);
              headers.set('Authorization', `Bearer ${data.accessToken}`);
              response = await fetch(url, { ...init, headers });
              return response;
            }
          }
        } catch {
          // Network error during refresh; let caller handle retry
        }
      }

      if (response.status === 401) {
        this.onAuthFailed?.();
        const authErr: any = new Error('Please log in again to sync.');
        authErr.isAuthError = true;
        throw authErr;
      }
    }

    return response;
  }

  public async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    const res = await this.fetchWithAuth('/sync/push', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Push failed with status ${res.status}`);
    }

    return res.json();
  }

  public async pull(query: SyncPullQuery): Promise<SyncPullResponse> {
    const params = new URLSearchParams({
      storeId: query.storeId,
      since: String(query.since),
      limit: String(query.limit),
    });

    const res = await this.fetchWithAuth(`/sync/pull?${params.toString()}`, {
      method: 'GET',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Pull failed with status ${res.status}`);
    }

    return res.json();
  }
}

export class SyncEngine {
  private db: CountwiseDatabase;
  private repo: LocalFirstRepository;
  private transport: SyncTransport;
  private batchSize: number;
  private pullLimit: number;
  private isRunning = false;
  private consecutiveFailures = 0;
  private listeners = new Set<(status: SyncStatusSnapshot) => void>();

  private currentStatus: SyncStatusSnapshot = {
    state: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'synced',
    lastSyncAt: null,
    lastPulledSeq: 0,
    lastError: null,
    authRequired: false,
    consecutiveFailures: 0,
  };

  constructor(options?: {
    db?: CountwiseDatabase;
    repo?: LocalFirstRepository;
    transport?: SyncTransport;
    batchSize?: number;
    pullLimit?: number;
  }) {
    this.db = options?.db ?? localDb;
    this.repo = options?.repo ?? new LocalFirstRepository(this.db);
    this.transport =
      options?.transport ??
      new HttpSyncTransport({
        onAuthFailed: () => {
          this.updateStatus({
            state: 'error',
            authRequired: true,
            lastError: 'Session expired. Please sign in again to sync.',
          });
        },
      });
    this.batchSize = options?.batchSize ?? 50;
    this.pullLimit = options?.pullLimit ?? 500;
  }

  public setTransport(transport: SyncTransport): void {
    this.transport = transport;
  }

  public getStatus(): SyncStatusSnapshot {
    return { ...this.currentStatus };
  }

  public subscribe(listener: (status: SyncStatusSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateStatus(partial: Partial<SyncStatusSnapshot>): void {
    this.currentStatus = { ...this.currentStatus, ...partial };
    for (const listener of this.listeners) {
      listener(this.getStatus());
    }
  }

  public async getLastPulledSeq(storeId: string): Promise<number> {
    const row = await this.db.meta.get(`lastPulledSeq:${storeId}`);
    if (row && typeof row.value === 'number') {
      return row.value;
    }
    const legacy = await this.db.meta.get('lastPulledSeq');
    if (legacy && typeof legacy.value === 'number') {
      return legacy.value;
    }
    return 0;
  }

  public async syncStore(storeId: string): Promise<SyncStatusSnapshot> {
    if (this.isRunning) {
      return this.getStatus();
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus({ state: 'offline' });
      return this.getStatus();
    }

    this.isRunning = true;
    this.updateStatus({ state: 'syncing', lastError: null });

    try {
      await this.pushOutboxLoop(storeId);
      const finalSeq = await this.pullChangesLoop(storeId);

      const now = Date.now();
      await this.db.meta.put({ key: 'lastSyncAt', value: now });

      this.consecutiveFailures = 0;
      this.updateStatus({
        state: 'synced',
        lastSyncAt: now,
        lastPulledSeq: finalSeq,
        lastError: null,
        authRequired: false,
        consecutiveFailures: 0,
      });

      return this.getStatus();
    } catch (err: any) {
      this.consecutiveFailures += 1;
      const isAuthError = Boolean(err?.isAuthError);

      await this.db.meta.put({
        key: 'lastSyncError',
        value: err?.message || 'Sync error',
      });

      this.updateStatus({
        state: 'error',
        lastError: err?.message || 'Network or server error during sync',
        authRequired: isAuthError,
        consecutiveFailures: this.consecutiveFailures,
      });

      throw err;
    } finally {
      this.isRunning = false;
    }
  }

  public getNextRetryDelayMs(): number {
    return computeBackoffDelay(this.consecutiveFailures);
  }

  public async pushOutboxLoop(storeId?: string): Promise<void> {
    const deviceId = await this.repo.getDeviceId();

    while (true) {
      const allOutbox = await this.db.outbox.orderBy('createdAt').toArray();
      const pending = allOutbox.filter(
        (m) => m.status === undefined || m.status === 'pending'
      );

      if (pending.length === 0) {
        break;
      }

      // Normalize any orphaned storeIds (e.g. from demo mode or a store switch) to the active storeId
      const rawSlice = pending.slice(0, this.batchSize);
      const batch: OutboxMutation[] = [];
      for (const m of rawSlice) {
        let normalized = m;
        if (storeId && m.storeId !== storeId) {
          const updatedPayload =
            m.payload && typeof m.payload === 'object'
              ? { ...m.payload, storeId }
              : m.payload;
          normalized = {
            ...m,
            storeId,
            payload: updatedPayload,
          };
        }

        // If pushing an adjustment, update, or delete, ensure the local product exists on server first
        const targetProductId =
          normalized.type === 'adjustment.create'
            ? normalized.payload?.productId
            : normalized.type === 'product.update' || normalized.type === 'product.delete'
            ? normalized.payload?.id
            : undefined;

        if (targetProductId) {
          const alreadyInBatch = batch.some(
            (b) => b.type === 'product.create' && b.payload?.id === targetProductId
          );
          if (!alreadyInBatch) {
            const localProd = await this.db.products.get(targetProductId);
            if (localProd) {
              batch.push({
                mutationId: generateMutationUuid(),
                storeId: normalized.storeId,
                type: 'product.create' as const,
                hlc: localProd.nameHlc,
                createdAt: normalized.createdAt - 1,
                attempts: 0,
                payload: {
                  id: localProd.id,
                  storeId: normalized.storeId,
                  name: localProd.name,
                  sku: localProd.sku ?? undefined,
                  category: localProd.category,
                  brand: localProd.brand ?? null,
                  price:
                    typeof localProd.price === 'number' && !Number.isNaN(localProd.price)
                      ? localProd.price
                      : 0,
                  costPrice: localProd.costPrice ?? null,
                  warranty: localProd.warranty ?? null,
                  specs: localProd.specs ?? null,
                  imageUrl:
                    localProd.imageUrl && localProd.imageUrl.length <= 2000
                      ? localProd.imageUrl
                      : null,
                  nameHlc: localProd.nameHlc,
                  skuHlc: localProd.skuHlc || localProd.nameHlc,
                  priceHlc: localProd.priceHlc || localProd.nameHlc,
                  imageHlc: localProd.imageHlc || localProd.nameHlc,
                },
              });
            }
          }
        }

        batch.push(normalized);
      }

      try {
        const response = await this.transport.push({
          deviceId,
          mutations: batch.map((m) => ({
            mutationId: m.mutationId,
            storeId: m.storeId,
            type: m.type,
            payload: m.payload,
            hlc: m.hlc,
            createdAt: m.createdAt,
          })),
        });

        await this.db.transaction('rw', [this.db.outbox], async () => {
          for (const res of response.results) {
            if (res.status === 'applied' || res.status === 'duplicate') {
              await this.db.outbox.delete(res.mutationId);
            } else if (res.status === 'rejected') {
              const current = await this.db.outbox.get(res.mutationId);
              if (current) {
                await this.db.outbox.put({
                  ...current,
                  status: 'rejected',
                  attempts: current.attempts + 1,
                  lastError: res.reason || 'Rejected by server validation',
                });
              }
            }
          }
        });
      } catch (err: any) {
        await this.db.transaction('rw', [this.db.outbox], async () => {
          for (const item of batch) {
            const current = await this.db.outbox.get(item.mutationId);
            if (current) {
              await this.db.outbox.put({
                ...current,
                attempts: current.attempts + 1,
                lastError: err?.message || 'Network push failure',
              });
            }
          }
        });
        throw err;
      }
    }
  }

  public async pullChangesLoop(storeId: string): Promise<number> {
    let since = await this.getLastPulledSeq(storeId);
    let hasMore = true;

    while (hasMore) {
      const response = await this.transport.pull({
        storeId,
        since,
        limit: this.pullLimit,
      });

      if (response.changes.length > 0) {
        for (const change of response.changes) {
          const p = change.payload;
          if (p?.hlc) {
            await this.repo.receiveRemoteHlc(p.hlc);
          } else if (p?.nameHlc) {
            await this.repo.receiveRemoteHlc(p.nameHlc);
          }
          if (p?.skuHlc) {
            await this.repo.receiveRemoteHlc(p.skuHlc);
          }
          if (p?.priceHlc) {
            await this.repo.receiveRemoteHlc(p.priceHlc);
          }
          if (p?.imageHlc) {
            await this.repo.receiveRemoteHlc(p.imageHlc);
          }
          if (p?.deletedHlc) {
            await this.repo.receiveRemoteHlc(p.deletedHlc);
          }
        }

        await this.db.transaction(
          'rw',
          [this.db.products, this.db.adjustments, this.db.orders, this.db.outbox, this.db.meta],
          async () => {
            const allOutbox = await this.db.outbox.toArray();
            const pendingOutbox = allOutbox
              .filter(
                (m) => m.storeId === storeId && (m.status === undefined || m.status === 'pending')
              )
              .sort((a, b) => a.createdAt - b.createdAt);

            for (const change of response.changes) {
              if (change.entityType === 'product') {
                const remote = change.payload;
                const existingLocal = await this.db.products.get(remote.id);
                const remoteDeletedAtMs = remote.deletedAt
                  ? new Date(remote.deletedAt).getTime()
                  : undefined;

                const resolvedImageUrl =
                  remote.imageUrl ??
                  existingLocal?.imageUrl ??
                  getDefaultCatalogImageUrl(remote.sku, remote.name) ??
                  undefined;

                const serverLocalState: ProductLocal = {
                  id: remote.id,
                  storeId: remote.storeId,
                  name: remote.name,
                  sku: remote.sku ?? undefined,
                  category: remote.category ?? 'Peripheral',
                  brand: remote.brand ?? undefined,
                  price: remote.price ?? 0,
                  costPrice: remote.costPrice ?? undefined,
                  warranty: remote.warranty ?? undefined,
                  specs: remote.specs ?? undefined,
                  imageUrl: resolvedImageUrl,
                  nameHlc: remote.nameHlc,
                  skuHlc: remote.skuHlc ?? remote.nameHlc,
                  priceHlc: remote.priceHlc ?? remote.nameHlc,
                  imageHlc: remote.imageHlc ?? existingLocal?.imageHlc ?? remote.nameHlc,
                  deletedAt: remoteDeletedAtMs,
                  deletedHlc: remote.deletedHlc ?? undefined,
                  serverSeq: change.seq,
                };
                await this.db.products.put(serverLocalState);
              } else if (change.entityType === 'adjustment') {
                const remote = change.payload;
                const adjLocal: AdjustmentLocal = {
                  id: remote.id,
                  productId: remote.productId,
                  storeId: remote.storeId,
                  delta: remote.delta,
                  reason: remote.reason,
                  countedPhysical: remote.countedPhysical ?? undefined,
                  localStockAtCount: remote.localStockAtCount ?? undefined,
                  createdAt: Number(remote.createdAt),
                  hlc: remote.hlc,
                  deviceId: remote.deviceId,
                  userId: remote.userId,
                };
                await this.db.adjustments.put(adjLocal);
              } else if (change.entityType === 'order') {
                const remote = change.payload;
                const orderLocal: SaleOrderLocal = {
                  id: remote.id,
                  storeId: remote.storeId,
                  receiptNumber: remote.receiptNumber,
                  customerName: remote.customerName ?? undefined,
                  customerPhone: remote.customerPhone ?? undefined,
                  items: remote.items,
                  subtotal: Number(remote.subtotal),
                  discountAmount: Number(remote.discountAmount ?? 0),
                  taxRate: Number(remote.taxRate ?? 12),
                  taxInclusive: Boolean(remote.taxInclusive ?? true),
                  taxAmount: Number(remote.taxAmount ?? 0),
                  totalAmount: Number(remote.totalAmount),
                  paymentMethod: remote.paymentMethod,
                  amountTendered: Number(remote.amountTendered),
                  changeDue: Number(remote.changeDue ?? 0),
                  notes: remote.notes ?? undefined,
                  createdAt: Number(remote.createdAt),
                  hlc: remote.hlc,
                  deviceId: remote.deviceId,
                  userId: remote.userId,
                  serverSeq: change.seq,
                };
                await this.db.orders.put(orderLocal);
              }
            }

            // Re-apply any pending local mutations on top of server state (Section 8)
            for (const pending of pendingOutbox) {
              if (pending.type === 'product.create') {
                const existing = await this.db.products.get(pending.payload.id);
                if (!existing) {
                  await this.db.products.put({
                    id: pending.payload.id,
                    storeId: pending.payload.storeId,
                    name: pending.payload.name,
                    sku: pending.payload.sku ?? undefined,
                    category: pending.payload.category ?? 'Peripheral',
                    brand: pending.payload.brand ?? undefined,
                    price: pending.payload.price ?? 0,
                    costPrice: pending.payload.costPrice ?? undefined,
                    warranty: pending.payload.warranty ?? undefined,
                    specs: pending.payload.specs ?? undefined,
                    imageUrl:
                      pending.payload.imageUrl ??
                      getDefaultCatalogImageUrl(pending.payload.sku, pending.payload.name) ??
                      undefined,
                    nameHlc: pending.payload.nameHlc,
                    skuHlc: pending.payload.skuHlc ?? pending.payload.nameHlc,
                    priceHlc: pending.payload.priceHlc ?? pending.payload.nameHlc,
                    imageHlc: pending.payload.imageHlc ?? pending.payload.nameHlc,
                  });
                }
              } else if (pending.type === 'product.update') {
                const prod = await this.db.products.get(pending.payload.id);
                if (prod && !prod.deletedAt) {
                  const updated = { ...prod };
                  if (
                    pending.payload.nameHlc &&
                    HybridLogicalClock.compare(pending.payload.nameHlc, updated.nameHlc) >= 0
                  ) {
                    if (pending.payload.name !== undefined) updated.name = pending.payload.name;
                    if (pending.payload.category !== undefined)
                      updated.category = pending.payload.category;
                    if (pending.payload.brand !== undefined)
                      updated.brand = pending.payload.brand ?? undefined;
                    if (pending.payload.warranty !== undefined)
                      updated.warranty = pending.payload.warranty ?? undefined;
                    if (pending.payload.specs !== undefined)
                      updated.specs = pending.payload.specs ?? undefined;
                    updated.nameHlc = pending.payload.nameHlc;
                  }
                  if (
                    pending.payload.sku !== undefined &&
                    pending.payload.skuHlc &&
                    HybridLogicalClock.compare(
                      pending.payload.skuHlc,
                      updated.skuHlc ?? updated.nameHlc
                    ) >= 0
                  ) {
                    updated.sku = pending.payload.sku ?? undefined;
                    updated.skuHlc = pending.payload.skuHlc;
                  }
                  if (
                    pending.payload.priceHlc &&
                    HybridLogicalClock.compare(
                      pending.payload.priceHlc,
                      updated.priceHlc ?? updated.nameHlc
                    ) >= 0
                  ) {
                    if (pending.payload.price !== undefined) updated.price = pending.payload.price;
                    if (pending.payload.costPrice !== undefined)
                      updated.costPrice = pending.payload.costPrice ?? undefined;
                    updated.priceHlc = pending.payload.priceHlc;
                  }
                  if (
                    pending.payload.imageUrl !== undefined &&
                    pending.payload.imageHlc &&
                    HybridLogicalClock.compare(
                      pending.payload.imageHlc,
                      updated.imageHlc ?? updated.nameHlc
                    ) >= 0
                  ) {
                    updated.imageUrl = pending.payload.imageUrl ?? undefined;
                    updated.imageHlc = pending.payload.imageHlc;
                  }
                  await this.db.products.put(updated);
                }
              } else if (pending.type === 'product.delete') {
                const prod = await this.db.products.get(pending.payload.id);
                if (prod) {
                  await this.db.products.put({
                    ...prod,
                    deletedAt: pending.payload.deletedAt,
                    deletedHlc: pending.payload.deletedHlc,
                  });
                }
              } else if (pending.type === 'order.update') {
                const ord = await this.db.orders.get(pending.payload.id);
                if (
                  ord &&
                  (!ord.hlc || HybridLogicalClock.compare(pending.payload.hlc, ord.hlc) >= 0)
                ) {
                  await this.db.orders.put({
                    ...ord,
                    items: pending.payload.items ?? ord.items,
                    notes:
                      pending.payload.notes !== undefined
                        ? (pending.payload.notes ?? undefined)
                        : ord.notes,
                    hlc: pending.payload.hlc,
                  });
                }
              }
            }

            await this.db.meta.put({
              key: `lastPulledSeq:${storeId}`,
              value: response.nextSeq,
            });
            await this.db.meta.put({
              key: 'lastPulledSeq',
              value: response.nextSeq,
            });
          }
        );
      }

      since = response.nextSeq;
      hasMore = response.hasMore;
    }

    return since;
  }
}

export const defaultSyncEngine = new SyncEngine({
  db: localDb,
  repo: localRepository,
});
