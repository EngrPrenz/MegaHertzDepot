import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { CountwiseDatabase } from '../src/db/index.js';

describe('Dexie Client Database', () => {
  let db: CountwiseDatabase;

  beforeEach(() => {
    db = new CountwiseDatabase();
  });

  it('should initialize local tables with correct schema', () => {
    expect(db.products).toBeDefined();
    expect(db.adjustments).toBeDefined();
    expect(db.outbox).toBeDefined();
    expect(db.meta).toBeDefined();
  });

  it('should store and retrieve offline products locally', async () => {
    const product = {
      id: '11111111-1111-1111-1111-111111111111',
      storeId: '22222222-2222-2222-2222-222222222222',
      name: 'Organic Milk 1L',
      sku: 'MILK-001',
      nameHlc: '001700000000000:000000:device-A',
    };

    await db.products.add(product);
    const retrieved = await db.products.get(product.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Organic Milk 1L');
    expect(retrieved?.sku).toBe('MILK-001');
  });

  it('should record offline outbox mutations', async () => {
    const mutation = {
      mutationId: '33333333-3333-3333-3333-333333333333',
      storeId: '22222222-2222-2222-2222-222222222222',
      type: 'product.create' as const,
      payload: { name: 'Bread' },
      hlc: '001700000000000:000001:device-A',
      createdAt: Date.now(),
      attempts: 0,
    };

    await db.outbox.add(mutation);
    const count = await db.outbox.count();

    expect(count).toBe(1);
    const stored = await db.outbox.get(mutation.mutationId);
    expect(stored?.type).toBe('product.create');
  });
});
