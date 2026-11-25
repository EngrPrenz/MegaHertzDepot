import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import { SAMPLE_PC_HARDWARE_CATALOG } from '@countwise/shared';
import { CountwiseDatabase } from '../src/db/index.js';
import { LocalFirstRepository } from '../src/services/localRepository.js';
import {
  resolveEffectiveStock,
  syncPublicCatalog,
  decrementCachedPublicStock,
  buildStockMap,
  buildAdjustmentStockMap,
  safeJsonParse,
} from '../src/services/publicCatalogSync.js';

describe('Dexie Client Database, Offline CRUD & Schema Migrations', () => {
  let db: CountwiseDatabase;
  let repo: LocalFirstRepository;
  const storeId = '22222222-2222-2222-2222-222222222222';
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db = new CountwiseDatabase(`test_db_${Math.random().toString(36).slice(2)}`);
    repo = new LocalFirstRepository(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize local tables with correct schema', () => {
    expect(db.products).toBeDefined();
    expect(db.adjustments).toBeDefined();
    expect(db.outbox).toBeDefined();
    expect(db.meta).toBeDefined();
  });

  it('should perform full offline CRUD and enqueue mutations in outbox', async () => {
    // 1. Create product with initial stock 10
    const created = await repo.createProduct({
      storeId,
      name: 'Organic Milk 1L',
      sku: 'MILK-001',
      initialStock: 10,
      userId,
    });

    expect(created.name).toBe('Organic Milk 1L');
    expect(created.sku).toBe('MILK-001');

    // Outbox should have product.create + adjustment.create
    let outbox = await db.outbox.orderBy('createdAt').toArray();
    expect(outbox).toHaveLength(2);
    expect(outbox[0].type).toBe('product.create');
    expect(outbox[1].type).toBe('adjustment.create');

    // 2. Update product name and SKU
    const updated = await repo.updateProduct({
      id: created.id,
      storeId,
      name: 'Organic Whole Milk 1L',
    });
    expect(updated.name).toBe('Organic Whole Milk 1L');

    // 3. Record stock adjustment (-3 sale) and physical count (12 on shelf -> +5 delta)
    await repo.recordAdjustment({
      productId: created.id,
      storeId,
      delta: -3,
      reason: 'sale',
      userId,
    });

    const stockBeforeCount = await repo.getProductStockInfo(created.id);
    expect(stockBeforeCount.currentStock).toBe(7);

    const countAdj = await repo.recordPhysicalCount({
      productId: created.id,
      storeId,
      countedPhysical: 12,
      userId,
    });
    expect(countAdj.delta).toBe(5);
    expect(countAdj.countedPhysical).toBe(12);
    expect(countAdj.localStockAtCount).toBe(7);

    const stockAfterCount = await repo.getProductStockInfo(created.id);
    expect(stockAfterCount.currentStock).toBe(12);

    // 4. Soft-delete product (tombstone)
    const deleted = await repo.deleteProduct({
      id: created.id,
      storeId,
    });
    expect(deleted.deletedAt).toBeDefined();
    expect(deleted.deletedHlc).toBeDefined();

    outbox = await db.outbox.orderBy('createdAt').toArray();
    expect(outbox.map((m) => m.type)).toEqual([
      'product.create',
      'adjustment.create',
      'product.update',
      'adjustment.create',
      'adjustment.create',
      'product.delete',
    ]);
  });

  it('should migrate legacy v1 IndexedDB schema to v2 preserving existing data', async () => {
    const dbName = `migration_test_${Math.random().toString(36).slice(2)}`;

    // Seed v1 database with legacy rows missing v2 fields (`skuHlc`, `status`, `entityId`)
    const v1Db = new Dexie(dbName);
    v1Db.version(1).stores({
      products: 'id, storeId, name, sku, nameHlc, deletedAt, serverSeq',
      adjustments: 'id, productId, storeId, reason, createdAt, hlc, deviceId',
      outbox: 'mutationId, storeId, type, createdAt, attempts',
      meta: 'key',
    });
    await v1Db.open();

    await v1Db.table('products').add({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      storeId,
      name: 'Legacy Rice 5kg',
      sku: 'RICE-05',
      nameHlc: '001700000000000:000000:dev-legacy',
    });

    await v1Db.table('outbox').add({
      mutationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      storeId,
      type: 'product.create',
      payload: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Legacy Rice 5kg',
      },
      hlc: '001700000000000:000000:dev-legacy',
      createdAt: 1700000000000,
      attempts: 0,
    });

    v1Db.close();

    // Open with CountwiseDatabase (v2) and verify upgrade migration
    const upgradedDb = new CountwiseDatabase(dbName);
    await upgradedDb.open();

    const product = await upgradedDb.products.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(product).toBeDefined();
    expect(product?.name).toBe('Legacy Rice 5kg');
    expect(product?.skuHlc).toBe('001700000000000:000000:dev-legacy');

    const outboxItem = await upgradedDb.outbox.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(outboxItem).toBeDefined();
    expect(outboxItem?.status).toBe('pending');
    expect(outboxItem?.entityId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    upgradedDb.close();
  });

  it('should seed the PC hardware catalog and atomically deduct stock on POS sale checkout', async () => {
    const seededCount = await repo.seedSampleHardwareCatalog(storeId, userId);
    expect(seededCount).toBe(SAMPLE_PC_HARDWARE_CATALOG.length);

    // Calling seed again when products exist is a no-op
    const secondSeed = await repo.seedSampleHardwareCatalog(storeId, userId);
    expect(secondSeed).toBe(0);

    const products = await db.products.where('storeId').equals(storeId).toArray();
    expect(products).toHaveLength(SAMPLE_PC_HARDWARE_CATALOG.length);

    const cpu = products.find((p) => p.sku === 'CPU-AMD-7800X3D')!;
    expect(cpu).toBeDefined();
    expect(cpu.category).toBe('CPU');
    expect(cpu.specs?.socket).toBe('AM5');
    expect(cpu.imageUrl).toBe('/images/products/CPU-AMD-7800X3D.webp');
    expect(products).toHaveLength(142);
    expect(products.every((p) => /^\/images\/products\/.+\.webp$/.test(p.imageUrl ?? ''))).toBe(true);

    const stockBefore = await repo.getProductStockInfo(cpu.id);
    expect(stockBefore.currentStock).toBe(8);

    // Complete an offline POS sale for 2 units of Ryzen 7 7800X3D
    const order = await repo.createSaleOrder({
      storeId,
      customerName: 'Marco Rig',
      items: [
        {
          productId: cpu.id,
          productName: cpu.name,
          sku: cpu.sku,
          category: cpu.category,
          unitPrice: cpu.price || 23950,
          quantity: 2,
          serialNumbers: ['SN-7800-A1', 'SN-7800-A2'],
          warranty: cpu.warranty,
        },
      ],
      subtotal: 47900,
      discountAmount: 900,
      taxRate: 12,
      taxInclusive: true,
      taxAmount: 5035.71,
      totalAmount: 47000,
      paymentMethod: 'Cash',
      amountTendered: 50000,
      changeDue: 3000,
      userId,
    });

    expect(order.receiptNumber).toMatch(/^MHD-/);
    expect(order.totalAmount).toBe(47000);

    // Stock should immediately drop from 8 to 6 via the atomic sale delta adjustment
    const stockAfter = await repo.getProductStockInfo(cpu.id);
    expect(stockAfter.currentStock).toBe(6);

    const savedOrders = await db.orders.where('storeId').equals(storeId).toArray();
    expect(savedOrders).toHaveLength(1);
    expect(savedOrders[0].items[0].serialNumbers).toEqual(['SN-7800-A1', 'SN-7800-A2']);
  });

  it('should rebind storeId on retryAllRejectedMutations and clear rejected items on dismissAllRejectedMutations', async () => {
    const wrongStoreId = '22222222-2222-2222-2222-222222222222';
    const realStoreId = '33333333-3333-4333-8333-333333333333';

    const created = await repo.createProduct({
      storeId: wrongStoreId,
      name: 'RTX 4070 Super',
      sku: 'GPU-NV-4070S',
      initialStock: 5,
      userId,
    });

    // Simulate server rejecting those 2 outbox items due to store mismatch
    const initialOutbox = await db.outbox.toArray();
    expect(initialOutbox).toHaveLength(2);
    for (const item of initialOutbox) {
      await db.outbox.update(item.mutationId, {
        status: 'rejected',
        attempts: 1,
        lastError: 'Forbidden: user does not belong to target store',
      });
    }

    const retriedCount = await repo.retryAllRejectedMutations(realStoreId);
    expect(retriedCount).toBe(2);

    const reboundProduct = await db.products.get(created.id);
    expect(reboundProduct?.storeId).toBe(realStoreId);

    const reboundAdjustments = await db.adjustments.where('productId').equals(created.id).toArray();
    expect(reboundAdjustments.every((a) => a.storeId === realStoreId)).toBe(true);

    const reboundOutbox = await db.outbox.toArray();
    expect(reboundOutbox).toHaveLength(2);
    for (const m of reboundOutbox) {
      expect(m.storeId).toBe(realStoreId);
      expect(m.payload.storeId).toBe(realStoreId);
      expect(m.status).toBe('pending');
      expect(m.attempts).toBe(0);
      expect(m.lastError).toBeUndefined();
    }

    // Mark 1 rejected and leave 1 pending, then dismissAllRejectedMutations
    await db.outbox.update(reboundOutbox[0].mutationId, {
      status: 'rejected',
      lastError: 'Some error',
    });

    const dismissedCount = await repo.dismissAllRejectedMutations();
    expect(dismissedCount).toBe(1);

    const remainingOutbox = await db.outbox.toArray();
    expect(remainingOutbox).toHaveLength(1);
    expect(remainingOutbox[0].mutationId).toBe(reboundOutbox[1].mutationId);
    expect(remainingOutbox[0].status).toBe('pending');
  });

  it('should reject createSaleOrder when amountTendered is less than totalAmount', async () => {
    const cpu = await repo.createProduct({
      storeId,
      name: 'AMD Ryzen 5 5600',
      sku: 'CPU-AMD-5600',
      price: 5200,
      initialStock: 5,
      userId,
    });

    await expect(
      repo.createSaleOrder({
        storeId,
        userId,
        items: [
          {
            productId: cpu.id,
            productName: cpu.name,
            sku: cpu.sku,
            category: 'CPU',
            unitPrice: 5200,
            quantity: 1,
            serialNumbers: [],
          },
        ],
        subtotal: 5200,
        discountAmount: 0,
        taxRate: 12,
        taxInclusive: true,
        taxAmount: 557.14,
        totalAmount: 5200,
        paymentMethod: 'Cash',
        amountTendered: 0,
        changeDue: 0,
      })
    ).rejects.toThrow('Amount tendered must be greater than or equal to the total amount due.');

    await expect(
      repo.createSaleOrder({
        storeId,
        userId,
        items: [
          {
            productId: cpu.id,
            productName: cpu.name,
            sku: cpu.sku,
            category: 'CPU',
            unitPrice: 5200,
            quantity: 1,
            serialNumbers: [],
          },
        ],
        subtotal: 5200,
        discountAmount: 0,
        taxRate: 12,
        taxInclusive: true,
        taxAmount: 557.14,
        totalAmount: 5200,
        paymentMethod: 'Cash',
        amountTendered: 5199.99,
        changeDue: 0,
      })
    ).rejects.toThrow('Amount tendered must be greater than or equal to the total amount due.');

    const exactOrder = await repo.createSaleOrder({
      storeId,
      userId,
      items: [
        {
          productId: cpu.id,
          productName: cpu.name,
          sku: cpu.sku,
          category: 'CPU',
          unitPrice: 5200,
          quantity: 1,
          serialNumbers: [],
        },
      ],
      subtotal: 5200,
      discountAmount: 0,
      taxRate: 12,
      taxInclusive: true,
      taxAmount: 557.14,
      totalAmount: 5200,
      paymentMethod: 'Cash',
      amountTendered: 5200,
      changeDue: 0,
    });
    expect(exactOrder.amountTendered).toBe(5200);
    expect(exactOrder.changeDue).toBe(0);
  });

  it('should persist publicStock across views, heal missing local-img pointers, and decrement cached stock', async () => {
    const productId = '50000000-0000-4000-8000-000000000021';
    const remoteStoreId = '689d7ece-d8a4-4bae-816f-924878890913';

    // Pre-seed a product with stale local-img:// missing from IndexedDB productImages
    await db.products.put({
      id: productId,
      storeId: remoteStoreId,
      name: 'AMD Ryzen 5 5600 6-Core Processor',
      sku: 'CPU-AMD-5600',
      category: 'CPU',
      price: 5200,
      imageUrl: 'local-img://missing-on-this-device',
      nameHlc: '001700000001000:000000:staff-pc',
      imageHlc: '001700000002000:000000:staff-pc',
    });

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        storeId: remoteStoreId,
        products: [
          {
            id: productId,
            storeId: remoteStoreId,
            name: 'AMD Ryzen 5 5600 6-Core Processor',
            sku: 'CPU-AMD-5600',
            category: 'CPU',
            brand: 'AMD',
            price: 5200,
            imageUrl: '/images/products/CPU-AMD-5600.webp',
            nameHlc: '001700000001000:000000:staff-pc',
            imageHlc: '001700000001000:000000:staff-pc',
            stock: 13,
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncPublicCatalog(remoteStoreId, { db });
    expect(result).toEqual({ storeId: remoteStoreId, productsCount: 1 });

    const synced = await db.products.get(productId);
    expect(synced).toBeDefined();
    expect(synced?.publicStock).toBe(13);
    expect(synced?.imageUrl).toBe('/images/products/CPU-AMD-5600.webp');

    // Without local adjustments, resolveEffectiveStock returns persisted publicStock
    expect(resolveEffectiveStock(synced!, [])).toBe(13);

    // Local adjustments override publicStock when present (e.g. staff terminal)
    expect(
      resolveEffectiveStock(synced!, [
        {
          id: 'adj-1',
          productId,
          storeId: remoteStoreId,
          delta: 7,
          reason: 'count',
          createdAt: Date.now(),
          hlc: '001700000003000:000000:pos',
          deviceId: 'pos',
          userId,
        },
      ])
    ).toBe(7);

    // Decrement cached stock optimistically after checkout
    await decrementCachedPublicStock([{ productId, quantity: 3 }], db);
    const afterDecrement = await db.products.get(productId);
    expect(afterDecrement?.publicStock).toBe(10);
    expect(resolveEffectiveStock(afterDecrement!, [])).toBe(10);
  });

  it('should compute customer stock maps and adjustment stock maps accurately, and safely parse JSON', () => {
    const products = [
      { id: 'p-1', publicStock: 12 },
      { id: 'p-2', publicStock: 4 },
      { id: 'p-3' },
    ];
    const adjustments = [
      {
        id: 'adj-a',
        productId: 'p-2',
        storeId,
        delta: 10,
        reason: 'restock' as const,
        createdAt: 1000,
        hlc: '001',
        deviceId: 'pos-1',
        userId,
      },
      {
        id: 'adj-b',
        productId: 'p-2',
        storeId,
        delta: -3,
        reason: 'sale' as const,
        createdAt: 2000,
        hlc: '002',
        deviceId: 'pos-1',
        userId,
      },
      {
        id: 'adj-c',
        productId: 'p-3',
        storeId,
        delta: 5,
        reason: 'restock' as const,
        createdAt: 3000,
        hlc: '003',
        deviceId: 'pos-1',
        userId,
      },
    ];

    const customerStock = buildStockMap(products, adjustments);
    expect(customerStock.get('p-1')).toBe(12);
    expect(customerStock.get('p-2')).toBe(7); // adjustments override publicStock
    expect(customerStock.get('p-3')).toBe(5);

    const terminalStock = buildAdjustmentStockMap(products, adjustments);
    expect(terminalStock.get('p-1')).toBe(0); // terminal mode ignores publicStock when 0 adjustments
    expect(terminalStock.get('p-2')).toBe(7);
    expect(terminalStock.get('p-3')).toBe(5);

    expect(safeJsonParse('{"ok":true}', { ok: false })).toEqual({ ok: true });
    expect(safeJsonParse('not-json', { fallback: 1 })).toEqual({ fallback: 1 });
    expect(safeJsonParse(null, ['default'])).toEqual(['default']);
  });
});
