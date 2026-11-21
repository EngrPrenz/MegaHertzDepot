import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { SAMPLE_PC_HARDWARE_CATALOG } from '@countwise/shared';
import { CountwiseDatabase } from '../src/db/index.js';
import { LocalFirstRepository } from '../src/services/localRepository.js';

describe('Dexie Client Database, Offline CRUD & Schema Migrations', () => {
  let db: CountwiseDatabase;
  let repo: LocalFirstRepository;
  const storeId = '22222222-2222-2222-2222-222222222222';
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db = new CountwiseDatabase(`test_db_${Math.random().toString(36).slice(2)}`);
    repo = new LocalFirstRepository(db);
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
    expect(cpu.imageUrl).toBe('/images/products/CPU-AMD-7800X3D.svg');
    expect(products.filter((p) => p.imageUrl).every((p) => p.imageUrl?.startsWith('/images/products/'))).toBe(true);

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
});
