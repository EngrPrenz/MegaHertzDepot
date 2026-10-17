import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import 'fake-indexeddb/auto';
import {
  SyncPushRequest,
  SyncPushResponse,
  SyncPullQuery,
  SyncPullResponse,
  ChangeLogItem,
  Product,
  Adjustment,
  MutationResult,
  productCreatePayloadSchema,
  productUpdatePayloadSchema,
  productDeletePayloadSchema,
  adjustmentCreatePayloadSchema,
  mergeProductCreate,
  mergeProductUpdate,
  mergeProductDelete,
  clampHlc,
  computeDerivedStock,
} from '@countwise/shared';
import { CountwiseDatabase } from '../src/db/index.js';
import { LocalFirstRepository } from '../src/services/localRepository.js';
import { SyncEngine, SyncTransport } from '../src/services/syncEngine.js';

/**
 * Simulated authoritative sync server used for headless SyncEngine failure injection
 * and multi-client property-based convergence testing (Section 12).
 */
class SimulatedSyncServer {
  public products = new Map<string, Product>();
  public adjustments = new Map<string, Adjustment>();
  public changeLog: ChangeLogItem[] = [];
  public appliedMutations = new Set<string>();
  private seq = 0;
  public serverTime = 1700000000000;

  public push(request: SyncPushRequest): SyncPushResponse {
    const results: MutationResult[] = [];

    for (const mutation of request.mutations) {
      if (this.appliedMutations.has(mutation.mutationId)) {
        results.push({ mutationId: mutation.mutationId, status: 'duplicate' });
        continue;
      }

      if (mutation.type === 'product.create') {
        const parsed = productCreatePayloadSchema.safeParse(mutation.payload);
        if (!parsed.success) {
          results.push({
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Validation error on product.create',
          });
          continue;
        }
        const existing = this.products.get(parsed.data.id);
        const merged = mergeProductCreate(existing, parsed.data, this.serverTime);
        this.seq += 1;
        const finalProduct: Product = { ...merged.product, updatedSeq: this.seq };
        this.products.set(finalProduct.id, finalProduct);
        this.changeLog.push({
          seq: this.seq,
          storeId: mutation.storeId,
          entityType: 'product',
          entityId: finalProduct.id,
          op: finalProduct.deletedAt ? 'delete' : 'upsert',
          payload: finalProduct as any,
          createdAt: new Date(this.serverTime).toISOString(),
        });
        this.appliedMutations.add(mutation.mutationId);
        results.push({ mutationId: mutation.mutationId, status: 'applied' });
      } else if (mutation.type === 'product.update') {
        const parsed = productUpdatePayloadSchema.safeParse(mutation.payload);
        if (!parsed.success) {
          results.push({
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Validation error on product.update',
          });
          continue;
        }
        const existing = this.products.get(parsed.data.id);
        if (!existing) {
          results.push({
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Product not found',
          });
          continue;
        }
        const merged = mergeProductUpdate(existing, parsed.data, mutation.hlc, this.serverTime);
        this.seq += 1;
        const finalProduct: Product = { ...merged.product, updatedSeq: this.seq };
        this.products.set(finalProduct.id, finalProduct);
        this.changeLog.push({
          seq: this.seq,
          storeId: mutation.storeId,
          entityType: 'product',
          entityId: finalProduct.id,
          op: finalProduct.deletedAt ? 'delete' : 'upsert',
          payload: finalProduct as any,
          createdAt: new Date(this.serverTime).toISOString(),
        });
        this.appliedMutations.add(mutation.mutationId);
        results.push({ mutationId: mutation.mutationId, status: 'applied' });
      } else if (mutation.type === 'product.delete') {
        const parsed = productDeletePayloadSchema.safeParse(mutation.payload);
        if (!parsed.success) {
          results.push({
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Validation error on product.delete',
          });
          continue;
        }
        const existing = this.products.get(parsed.data.id);
        if (!existing) {
          results.push({
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Product not found',
          });
          continue;
        }
        const merged = mergeProductDelete(existing, parsed.data, this.serverTime);
        this.seq += 1;
        const finalProduct: Product = { ...merged.product, updatedSeq: this.seq };
        this.products.set(finalProduct.id, finalProduct);
        this.changeLog.push({
          seq: this.seq,
          storeId: mutation.storeId,
          entityType: 'product',
          entityId: finalProduct.id,
          op: 'delete',
          payload: finalProduct as any,
          createdAt: new Date(this.serverTime).toISOString(),
        });
        this.appliedMutations.add(mutation.mutationId);
        results.push({ mutationId: mutation.mutationId, status: 'applied' });
      } else if (mutation.type === 'adjustment.create') {
        const parsed = adjustmentCreatePayloadSchema.safeParse(mutation.payload);
        if (!parsed.success || !this.products.has(parsed.data.productId)) {
          results.push({
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Invalid adjustment or missing product',
          });
          continue;
        }
        if (!this.adjustments.has(parsed.data.id)) {
          const adj: Adjustment = {
            id: parsed.data.id,
            productId: parsed.data.productId,
            storeId: parsed.data.storeId,
            delta: parsed.data.delta,
            reason: parsed.data.reason,
            countedPhysical: parsed.data.countedPhysical ?? null,
            localStockAtCount: parsed.data.localStockAtCount ?? null,
            createdAt: parsed.data.createdAt,
            hlc: clampHlc(parsed.data.hlc, this.serverTime),
            deviceId: parsed.data.deviceId,
            userId: 'user-sim',
          };
          this.adjustments.set(adj.id, adj);
          this.seq += 1;
          this.changeLog.push({
            seq: this.seq,
            storeId: mutation.storeId,
            entityType: 'adjustment',
            entityId: adj.id,
            op: 'upsert',
            payload: adj as any,
            createdAt: new Date(this.serverTime).toISOString(),
          });
        }
        this.appliedMutations.add(mutation.mutationId);
        results.push({ mutationId: mutation.mutationId, status: 'applied' });
      }
    }

    return { results };
  }

  public pull(query: SyncPullQuery): SyncPullResponse {
    const matching = this.changeLog
      .filter((c) => c.storeId === query.storeId && c.seq > query.since)
      .sort((a, b) => a.seq - b.seq);

    const hasMore = matching.length > query.limit;
    const changes = matching.slice(0, query.limit);
    const nextSeq = changes.length > 0 ? changes[changes.length - 1].seq : query.since;

    return { changes, nextSeq, hasMore };
  }
}

async function createSimulatedClient(
  name: string,
  server: SimulatedSyncServer,
  options?: { dropFirstPushResponse?: boolean; pullLimit?: number; batchSize?: number }
) {
  const db = new CountwiseDatabase(`sim_${name}_${Math.random().toString(36).slice(2)}`);
  await db.meta.put({ key: 'deviceId', value: name });
  const repo = new LocalFirstRepository(db);

  let droppedOnce = false;
  const transport: SyncTransport = {
    async push(req) {
      // Server processes the request first
      const res = server.push(req);
      // Failure scenario: connection drops AFTER server applied mutations, BEFORE client got response
      if (options?.dropFirstPushResponse && !droppedOnce) {
        droppedOnce = true;
        throw new Error('Simulated mid-push connection drop after server commit');
      }
      return res;
    },
    async pull(query) {
      return server.pull(query);
    },
  };

  const engine = new SyncEngine({
    db,
    repo,
    transport,
    batchSize: options?.batchSize ?? 10,
    pullLimit: options?.pullLimit ?? 15,
  });

  return { db, repo, engine };
}

describe('Headless Sync Engine Failure Injection & Multi-Client Convergence', () => {
  const storeId = '22222222-2222-2222-2222-222222222222';
  const userId = '11111111-1111-1111-1111-111111111111';

  it('Scenario: Connection drops mid-push after server commit -> retry never duplicates stock', async () => {
    const server = new SimulatedSyncServer();
    const clientA = await createSimulatedClient('dev-A', server, {
      dropFirstPushResponse: true,
    });
    const clientB = await createSimulatedClient('dev-B', server);

    const prod = await clientA.repo.createProduct({
      storeId,
      name: 'Espresso Roast',
      sku: 'ESP-01',
      initialStock: 25,
      userId,
      now: 1700000001000,
    });

    // First sync throws mid-push AFTER server committed!
    await expect(clientA.engine.syncStore(storeId)).rejects.toThrow(
      'Simulated mid-push connection drop'
    );

    // Outbox still has the 2 items on Client A because it never got the response
    expect(await clientA.db.outbox.count()).toBe(2);

    // Retry sync: server returns 'duplicate' for both mutationIds, client drains outbox
    await clientA.engine.syncStore(storeId);
    expect(await clientA.db.outbox.count()).toBe(0);

    // Client B pulls and sees exact stock of 25 (not 50!)
    await clientB.engine.syncStore(storeId);
    const bStock = await clientB.repo.getProductStockInfo(prod.id);
    expect(bStock.currentStock).toBe(25);
  });

  it('Scenario: Server rejects one mutation in a batch while applying the rest', async () => {
    const server = new SimulatedSyncServer();
    const clientA = await createSimulatedClient('dev-A', server);

    // Enqueue a valid product creation
    const validProd = await clientA.repo.createProduct({
      storeId,
      name: 'Valid Tea',
      userId,
      now: 1700000001000,
    });

    // Enqueue a malformed update for a non-existent product ID
    await clientA.db.outbox.add({
      mutationId: '99999999-9999-4999-8999-999999999999',
      storeId,
      type: 'product.update',
      payload: {
        id: '88888888-8888-4888-8888-888888888888',
        storeId,
        name: 'Ghost Product',
      },
      hlc: '001700000002000:000000:dev-A',
      createdAt: 1700000002000,
      attempts: 0,
      status: 'pending',
    });

    await clientA.engine.syncStore(storeId);

    // Valid mutation was removed from outbox; rejected mutation remains flagged as 'rejected'
    const remainingOutbox = await clientA.db.outbox.toArray();
    expect(remainingOutbox).toHaveLength(1);
    expect(remainingOutbox[0].mutationId).toBe('99999999-9999-4999-8999-999999999999');
    expect(remainingOutbox[0].status).toBe('rejected');

    // Valid product reached the server
    expect(server.products.get(validProd.id)?.name).toBe('Valid Tea');
  });

  it('Scenario: Pull returns changes for an item that still has a pending local edit in outbox', async () => {
    const server = new SimulatedSyncServer();
    const clientA = await createSimulatedClient('dev-A', server);
    const clientB = await createSimulatedClient('dev-B', server);

    // Client A creates product and syncs
    const prod = await clientA.repo.createProduct({
      storeId,
      name: 'Initial Name',
      sku: 'SKU-INIT',
      userId,
      now: 1700000001000,
    });
    await clientA.engine.syncStore(storeId);
    await clientB.engine.syncStore(storeId);

    // Client A updates SKU and syncs to server at t=2000
    await clientA.repo.updateProduct({
      id: prod.id,
      storeId,
      sku: 'SKU-FROM-A',
      now: 1700000002000,
    });
    await clientA.engine.syncStore(storeId);

    // Client B makes a local offline edit to Name at t=3000 (still in Client B's outbox!)
    await clientB.repo.updateProduct({
      id: prod.id,
      storeId,
      name: 'Unsynced Local Name on B',
      now: 1700000003000,
    });

    // Suppose Client B pulls BEFORE pushing its outbox
    await clientB.engine.pullChangesLoop(storeId);

    // Client B must have BOTH A's pulled SKU AND B's pending local Name!
    const localOnB = await clientB.db.products.get(prod.id);
    expect(localOnB?.name).toBe('Unsynced Local Name on B');
    expect(localOnB?.sku).toBe('SKU-FROM-A');
  });

  it('Property-Based Convergence Suite: 3 offline clients performing random CRUD, deltas, deletes, and interleaved syncs converge to identical state', async () => {
    const productUuidPool = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ];

    const operationArb = fc.oneof(
      fc.record({
        op: fc.constant('create' as const),
        clientIdx: fc.integer({ min: 0, max: 2 }),
        productIdx: fc.integer({ min: 0, max: 2 }),
        name: fc.stringMatching(/^[A-Za-z0-9 ]{3,15}$/),
        sku: fc.stringMatching(/^[A-Z0-9-]{3,8}$/),
        timeAdvance: fc.integer({ min: 10, max: 5000 }),
      }),
      fc.record({
        op: fc.constant('updateName' as const),
        clientIdx: fc.integer({ min: 0, max: 2 }),
        productIdx: fc.integer({ min: 0, max: 2 }),
        name: fc.stringMatching(/^[A-Za-z0-9 ]{3,15}$/),
        timeAdvance: fc.integer({ min: 10, max: 5000 }),
      }),
      fc.record({
        op: fc.constant('updateSku' as const),
        clientIdx: fc.integer({ min: 0, max: 2 }),
        productIdx: fc.integer({ min: 0, max: 2 }),
        sku: fc.stringMatching(/^[A-Z0-9-]{3,8}$/),
        timeAdvance: fc.integer({ min: 10, max: 5000 }),
      }),
      fc.record({
        op: fc.constant('adjust' as const),
        clientIdx: fc.integer({ min: 0, max: 2 }),
        productIdx: fc.integer({ min: 0, max: 2 }),
        delta: fc.integer({ min: -10, max: 25 }),
        timeAdvance: fc.integer({ min: 10, max: 5000 }),
      }),
      fc.record({
        op: fc.constant('delete' as const),
        clientIdx: fc.integer({ min: 0, max: 2 }),
        productIdx: fc.integer({ min: 0, max: 2 }),
        timeAdvance: fc.integer({ min: 10, max: 5000 }),
      }),
      fc.record({
        op: fc.constant('sync' as const),
        clientIdx: fc.integer({ min: 0, max: 2 }),
        timeAdvance: fc.integer({ min: 10, max: 1000 }),
      })
    );

    await fc.assert(
      fc.asyncProperty(fc.array(operationArb, { minLength: 8, maxLength: 30 }), async (ops) => {
        const server = new SimulatedSyncServer();
        const clients = [
          await createSimulatedClient('node-A', server, { pullLimit: 4, batchSize: 3 }),
          await createSimulatedClient('node-B', server, { pullLimit: 4, batchSize: 3 }),
          await createSimulatedClient('node-C', server, { pullLimit: 4, batchSize: 3 }),
        ];

        let simClock = 1700000000000;

        // Seed all 3 products on Client 0 and sync to all clients so every client knows the base products
        for (let i = 0; i < productUuidPool.length; i++) {
          simClock += 100;
          await clients[0].repo.createProduct({
            id: productUuidPool[i],
            storeId,
            name: `BaseProduct-${i}`,
            sku: `BASE-${i}`,
            userId,
            now: simClock,
          });
        }
        for (const c of clients) {
          await c.engine.syncStore(storeId);
        }

        // Execute random offline operations and random intermediate syncs
        for (const step of ops) {
          simClock += step.timeAdvance;
          server.serverTime = simClock;
          const client = clients[step.clientIdx];

          if (step.op === 'sync') {
            await client.engine.syncStore(storeId);
            continue;
          }

          const pid = productUuidPool[step.productIdx];
          const existingLocal = await client.db.products.get(pid);

          if (step.op === 'create') {
            if (!existingLocal) {
              await client.repo.createProduct({
                id: pid,
                storeId,
                name: step.name,
                sku: step.sku,
                userId,
                now: simClock,
              });
            }
          } else if (step.op === 'updateName') {
            if (existingLocal && !existingLocal.deletedAt) {
              await client.repo.updateProduct({
                id: pid,
                storeId,
                name: step.name,
                now: simClock,
              });
            }
          } else if (step.op === 'updateSku') {
            if (existingLocal && !existingLocal.deletedAt) {
              await client.repo.updateProduct({
                id: pid,
                storeId,
                sku: step.sku,
                now: simClock,
              });
            }
          } else if (step.op === 'adjust') {
            if (existingLocal && step.delta !== 0) {
              await client.repo.recordAdjustment({
                productId: pid,
                storeId,
                delta: step.delta,
                reason: step.delta > 0 ? 'restock' : 'sale',
                userId,
                now: simClock,
              });
            }
          } else if (step.op === 'delete') {
            if (existingLocal && !existingLocal.deletedAt) {
              await client.repo.deleteProduct({
                id: pid,
                storeId,
                now: simClock,
              });
            }
          }
        }

        // Final convergence barrier: all clients push remaining outbox and pull all changes
        for (const c of clients) {
          await c.engine.syncStore(storeId);
        }
        for (const c of clients) {
          await c.engine.syncStore(storeId);
        }

        // Verify all 3 clients have 0 pending outbox items and identical product & stock state
        const snapshots = [];
        for (const c of clients) {
          const pending = await c.db.outbox
            .filter((m) => m.status === undefined || m.status === 'pending')
            .count();
          expect(pending).toBe(0);

          const prods = await c.db.products.orderBy('id').toArray();
          const adjs = await c.db.adjustments.toArray();

          const normalized = prods.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku ?? null,
            nameHlc: p.nameHlc,
            skuHlc: p.skuHlc ?? p.nameHlc,
            isDeleted: Boolean(p.deletedAt),
            deletedHlc: p.deletedHlc ?? null,
            stock: computeDerivedStock(adjs.filter((a) => a.productId === p.id)),
          }));
          snapshots.push(normalized);
        }

        expect(snapshots[0]).toEqual(snapshots[1]);
        expect(snapshots[1]).toEqual(snapshots[2]);
      }),
      { numRuns: 25 }
    );
  });
});

