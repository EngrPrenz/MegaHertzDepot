import { describe, it, expect } from 'vitest';
import {
  clampHlc,
  MAX_CLOCK_DRIFT_MS,
  mergeProductCreate,
  mergeProductUpdate,
  mergeProductDelete,
  computeDerivedStock,
  analyzeStockCountSemantics,
  computeBackoffDelay,
  InMemorySyncReplica,
} from '../src/conflict.js';
import { HybridLogicalClock } from '../src/hlc.js';

describe('Conflict Resolution & Clock Clamping Rules', () => {
  const storeId = '22222222-2222-2222-2222-222222222222';
  const productId = '11111111-1111-1111-1111-111111111111';

  it('should clamp future client HLC timestamps exceeding MAX_CLOCK_DRIFT_MS', () => {
    const serverNow = 1700000000000;
    const farFutureMillis = serverNow + MAX_CLOCK_DRIFT_MS + 600000; // 15 mins ahead
    const futureHlc = HybridLogicalClock.format({
      millis: farFutureMillis,
      counter: 3,
      nodeId: 'device-skewed',
    });

    const clamped = clampHlc(futureHlc, serverNow);
    const parsed = HybridLogicalClock.parse(clamped);

    expect(parsed.millis).toBe(serverNow + MAX_CLOCK_DRIFT_MS);
    expect(parsed.counter).toBe(3);
    expect(parsed.nodeId).toBe('device-skewed');
  });

  it('should resolve per-field Last-Write-Wins (LWW) independently for name and sku', () => {
    const initial = mergeProductCreate(undefined, {
      id: productId,
      storeId,
      name: 'Original Name',
      sku: 'SKU-100',
      nameHlc: '001700000001000:000000:dev-A',
      skuHlc: '001700000001000:000000:dev-A',
    }).product;

    // Device B updates Name at t=2000
    const afterB = mergeProductUpdate(
      initial,
      {
        id: productId,
        storeId,
        name: 'Updated Name by B',
        nameHlc: '001700000002000:000000:dev-B',
      },
      '001700000002000:000000:dev-B'
    ).product;

    // Device A updates SKU at t=1500 (older than B's name update, but newer than initial SKU at t=1000)
    // and also sends a stale name at t=1500
    const afterA = mergeProductUpdate(
      afterB,
      {
        id: productId,
        storeId,
        name: 'Stale Name by A',
        nameHlc: '001700000001500:000000:dev-A',
        sku: 'SKU-200-A',
        skuHlc: '001700000001500:000000:dev-A',
      },
      '001700000001500:000000:dev-A'
    ).product;

    // Name from B (t=2000) wins over A (t=1500), while SKU from A (t=1500) wins over initial (t=1000)!
    expect(afterA.name).toBe('Updated Name by B');
    expect(afterA.sku).toBe('SKU-200-A');
  });

  it('should enforce Delete Wins over concurrent Edit rule', () => {
    const initial = mergeProductCreate(undefined, {
      id: productId,
      storeId,
      name: 'Coffee Beans',
      sku: 'COF-01',
      nameHlc: '001700000001000:000000:dev-A',
    }).product;

    // Device B deletes product at t=1500
    const deleted = mergeProductDelete(initial, {
      id: productId,
      storeId,
      deletedAt: 1700000001500,
      deletedHlc: '001700000001500:000000:dev-B',
    }).product;

    expect(deleted.deletedAt).toBeTruthy();

    // Device A concurrently renames product at t=2000 (later timestamp, but product is tombstoned)
    const editResult = mergeProductUpdate(
      deleted,
      {
        id: productId,
        storeId,
        name: 'Renamed Coffee Beans',
        nameHlc: '001700000002000:000000:dev-A',
      },
      '001700000002000:000000:dev-A'
    );

    expect(editResult.changed).toBe(false);
    expect(editResult.product.deletedAt).toBeTruthy();
    expect(editResult.product.name).toBe('Coffee Beans');
  });

  it('should compute commutative stock deltas and analyze physical count discrepancies', () => {
    const adjustments = [
      {
        id: 'a1',
        productId,
        storeId,
        delta: 20,
        reason: 'restock' as const,
        createdAt: 1000,
        hlc: '001700000001000:000000:dev-A',
        deviceId: 'dev-A',
        userId: 'u1',
      },
      {
        id: 'a2',
        productId,
        storeId,
        delta: 4, // User counted 24 when local stock was 20
        countedPhysical: 24,
        localStockAtCount: 20,
        reason: 'count' as const,
        createdAt: 2000,
        hlc: '001700000002000:000000:dev-A',
        deviceId: 'dev-A',
        userId: 'u1',
      },
      {
        id: 'a3',
        productId,
        storeId,
        delta: 2, // Another device restocked +2 concurrently
        reason: 'restock' as const,
        createdAt: 1800,
        hlc: '001700000001800:000000:dev-B',
        deviceId: 'dev-B',
        userId: 'u2',
      },
    ];

    expect(computeDerivedStock(adjustments)).toBe(26);
    expect(computeDerivedStock([...adjustments].reverse())).toBe(26);

    const analysis = analyzeStockCountSemantics(adjustments);
    expect(analysis.hasCount).toBe(true);
    expect(analysis.countedPhysical).toBe(24);
    expect(analysis.adjustedSinceCount).toBe(2);
    expect(analysis.currentStock).toBe(26);
    expect(analysis.discrepancyExists).toBe(true);
  });

  it('should compute exponential backoff with jitter within bounds', () => {
    const d0 = computeBackoffDelay(0, 1000, 30000, () => 0.5);
    const d3 = computeBackoffDelay(3, 1000, 30000, () => 0.5);
    const d20 = computeBackoffDelay(20, 1000, 30000, () => 0.99);

    expect(d0).toBeGreaterThanOrEqual(700);
    expect(d0).toBeLessThanOrEqual(1000);
    expect(d3).toBeGreaterThan(d0);
    expect(d20).toBeLessThanOrEqual(30000);
  });

  it('should converge InMemorySyncReplica regardless of message arrival order', () => {
    const r1 = new InMemorySyncReplica();
    const r2 = new InMemorySyncReplica();

    const pState1 = {
      id: productId,
      storeId,
      name: 'Alpha',
      sku: 'SKU-1',
      nameHlc: '001700000001000:000000:dev-A',
      skuHlc: '001700000002000:000000:dev-A',
      deletedAt: null,
      deletedHlc: null,
    };
    const pState2 = {
      id: productId,
      storeId,
      name: 'Beta',
      sku: 'SKU-0',
      nameHlc: '001700000003000:000000:dev-B',
      skuHlc: '001700000001500:000000:dev-B',
      deletedAt: null,
      deletedHlc: null,
    };

    r1.applyProductState(pState1);
    r1.applyProductState(pState2);

    r2.applyProductState(pState2);
    r2.applyProductState(pState1);

    expect(r1.products.get(productId)).toEqual(r2.products.get(productId));
    expect(r1.products.get(productId)?.name).toBe('Beta');
    expect(r1.products.get(productId)?.sku).toBe('SKU-1');
  });

  it('should detect CPU/Motherboard socket and DDR mismatches and compute wattage headroom', async () => {
    const { analyzePcBuildCompatibility } = await import('../src/hardwareCatalog.js');

    const incompatible = analyzePcBuildCompatibility({
      CPU: {
        name: 'AMD Ryzen 7 7800X3D',
        category: 'CPU',
        specs: { socket: 'AM5', wattage: 120 },
      },
      Motherboard: {
        name: 'MSI PRO B760M-A DDR4',
        category: 'Motherboard',
        specs: { socket: 'LGA1700', ramType: 'DDR4', wattage: 45 },
      },
      RAM: {
        name: 'G.Skill Trident Z5 DDR5',
        category: 'RAM',
        specs: { ramType: 'DDR5', wattage: 15 },
      },
      GPU: {
        name: 'RTX 4070 Super',
        category: 'GPU',
        specs: { wattage: 220 },
      },
      PSU: {
        name: 'Generic 350W PSU',
        category: 'PSU',
        specs: { wattage: 350 },
      },
    });

    expect(incompatible.isCompatible).toBe(false);
    expect(incompatible.errors).toHaveLength(3); // Socket mismatch, DDR mismatch, PSU insufficient
    expect(incompatible.estimatedSystemWatts).toBe(400);

    const compatible = analyzePcBuildCompatibility({
      CPU: {
        name: 'AMD Ryzen 7 7800X3D',
        category: 'CPU',
        specs: { socket: 'AM5', wattage: 120 },
      },
      Motherboard: {
        name: 'ASUS ROG Strix B650-A',
        category: 'Motherboard',
        specs: { socket: 'AM5', ramType: 'DDR5', wattage: 55 },
      },
      RAM: {
        name: 'G.Skill Trident Z5 DDR5',
        category: 'RAM',
        specs: { ramType: 'DDR5', wattage: 15 },
      },
      GPU: {
        name: 'RTX 4070 Super',
        category: 'GPU',
        specs: { wattage: 220 },
      },
      PSU: {
        name: 'Corsair RM750e 750W',
        category: 'PSU',
        specs: { wattage: 750 },
      },
    });

    expect(compatible.isCompatible).toBe(true);
    expect(compatible.errors).toHaveLength(0);
    expect(compatible.estimatedSystemWatts).toBe(410);
  });
});


