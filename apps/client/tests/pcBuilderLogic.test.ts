import { describe, it, expect } from 'vitest';
import {
  SAMPLE_PC_HARDWARE_CATALOG,
  analyzePcBuildCompatibility,
} from '@countwise/shared';
import { ProductLocal } from '../src/db/index.js';
import {
  CORE_BUILD_SLOTS,
  autoFillBuildWithinBudget,
  computeTraceStates,
  diffBuildSnapshots,
  evaluatePartCompatibility,
  findCuratedPreset,
  resolveBuildFromSlotIds,
} from '../src/services/pcBuilderLogic.js';
import { computeNextColorSchemeOverride } from '../src/hooks/useColorScheme.js';

const STORE_ID = 'store-test-1';

const CATALOG_PRODUCTS: ProductLocal[] = SAMPLE_PC_HARDWARE_CATALOG.map((item, idx) => ({
  id: item.id,
  storeId: STORE_ID,
  name: item.name,
  sku: item.sku,
  category: item.category,
  brand: item.brand,
  price: item.price,
  costPrice: item.costPrice,
  warranty: item.warranty,
  specs: item.specs,
  imageUrl: item.imageUrl,
  publicStock: item.initialStock,
  nameHlc: `0000000000000-0000-dev-${idx}`,
}));

function buildDefaultStockMap(products: ProductLocal[]): Map<string, number> {
  return new Map(products.map((p) => [p.id, p.publicStock ?? 5]));
}

describe('pcBuilderLogic', () => {
  describe('evaluatePartCompatibility', () => {
    it('detects CPU/Motherboard socket matches and mismatches', () => {
      const am5Mobo: ProductLocal = {
        id: 'mobo-am5',
        storeId: STORE_ID,
        name: 'B650 AM5 Board',
        category: 'Motherboard',
        price: 11000,
        specs: { socket: 'AM5', ramType: 'DDR5', wattage: 40 },
        nameHlc: 'hlc-1',
      };
      const am5Cpu: ProductLocal = {
        id: 'cpu-am5',
        storeId: STORE_ID,
        name: 'Ryzen 5 7600',
        category: 'CPU',
        price: 12000,
        specs: { socket: 'AM5', wattage: 65 },
        nameHlc: 'hlc-2',
      };
      const lgaCpu: ProductLocal = {
        id: 'cpu-lga',
        storeId: STORE_ID,
        name: 'Core i5-14600K',
        category: 'CPU',
        price: 18000,
        specs: { socket: 'LGA1700', wattage: 125 },
        nameHlc: 'hlc-3',
      };

      const record = { Motherboard: am5Mobo };
      const compat = analyzePcBuildCompatibility(record);

      expect(evaluatePartCompatibility(am5Cpu, record, compat)).toEqual({
        compatible: true,
        severity: 'ok',
        reasons: [],
      });

      const mismatch = evaluatePartCompatibility(lgaCpu, record, compat);
      expect(mismatch.compatible).toBe(false);
      expect(mismatch.severity).toBe('error');
      expect(mismatch.reasons[0]).toContain('LGA1700');
    });

    it('detects RAM DDR4 vs DDR5 mismatch against installed motherboard', () => {
      const am5Mobo: ProductLocal = {
        id: 'mobo-am5',
        storeId: STORE_ID,
        name: 'B650 AM5 Board',
        category: 'Motherboard',
        price: 11000,
        specs: { socket: 'AM5', ramType: 'DDR5', wattage: 40 },
        nameHlc: 'hlc-1',
      };
      const ddr4Ram: ProductLocal = {
        id: 'ram-ddr4',
        storeId: STORE_ID,
        name: '16GB DDR4 3200',
        category: 'RAM',
        price: 2500,
        specs: { ramType: 'DDR4', wattage: 5 },
        nameHlc: 'hlc-2',
      };

      const record = { Motherboard: am5Mobo };
      const compat = analyzePcBuildCompatibility(record);
      const res = evaluatePartCompatibility(ddr4Ram, record, compat);
      expect(res.compatible).toBe(false);
      expect(res.severity).toBe('error');
      expect(res.reasons[0]).toContain('DDR5');
    });

    it('checks PSU load, tight headroom warning, sufficient PSU, and single-slot swap delta', () => {
      const cpu: ProductLocal = {
        id: 'cpu-1',
        storeId: STORE_ID,
        name: 'CPU 120W',
        category: 'CPU',
        price: 15000,
        specs: { socket: 'AM5', wattage: 120 },
        nameHlc: 'hlc-1',
      };
      const gpu150: ProductLocal = {
        id: 'gpu-150',
        storeId: STORE_ID,
        name: 'GPU 150W',
        category: 'GPU',
        price: 20000,
        specs: { wattage: 150 },
        nameHlc: 'hlc-2',
      };
      const gpu450: ProductLocal = {
        id: 'gpu-450',
        storeId: STORE_ID,
        name: 'GPU 450W',
        category: 'GPU',
        price: 65000,
        specs: { wattage: 450 },
        nameHlc: 'hlc-3',
      };

      // System draw: 120 + 150 = 270W; recommended PSU = ceil(270 * 1.25 / 50) * 50 = 350W
      const baseRecord = { CPU: cpu, GPU: gpu150 };
      const baseCompat = analyzePcBuildCompatibility(baseRecord);

      const weakPsu: ProductLocal = {
        id: 'psu-250',
        storeId: STORE_ID,
        name: '250W PSU',
        category: 'PSU',
        price: 1500,
        specs: { wattage: 250 },
        nameHlc: 'hlc-4',
      };
      const tightPsu: ProductLocal = {
        id: 'psu-300',
        storeId: STORE_ID,
        name: '300W PSU',
        category: 'PSU',
        price: 2000,
        specs: { wattage: 300 },
        nameHlc: 'hlc-5',
      };
      const goodPsu: ProductLocal = {
        id: 'psu-550',
        storeId: STORE_ID,
        name: '550W PSU',
        category: 'PSU',
        price: 3500,
        specs: { wattage: 550 },
        nameHlc: 'hlc-6',
      };

      expect(evaluatePartCompatibility(weakPsu, baseRecord, baseCompat)).toMatchObject({
        compatible: false,
        severity: 'error',
      });
      expect(evaluatePartCompatibility(tightPsu, baseRecord, baseCompat)).toMatchObject({
        compatible: true,
        severity: 'warning',
      });
      expect(evaluatePartCompatibility(goodPsu, baseRecord, baseCompat)).toMatchObject({
        compatible: true,
        severity: 'ok',
      });

      // Swapping 150W GPU with 450W GPU under 550W PSU: 270 - 150 + 450 = 570W > 550W PSU -> error
      const recordWith550 = { CPU: cpu, GPU: gpu150, PSU: goodPsu };
      const compatWith550 = analyzePcBuildCompatibility(recordWith550);
      const swapEval = evaluatePartCompatibility(gpu450, recordWith550, compatWith550);
      expect(swapEval.compatible).toBe(false);
      expect(swapEval.severity).toBe('error');
      expect(swapEval.reasons[0]).toContain('550W');
    });
  });

  describe('computeTraceStates', () => {
    it('returns idle, ok, warning, and error states matching installed traces', () => {
      const empty = computeTraceStates({}, analyzePcBuildCompatibility({}));
      expect(empty.cpuMobo.state).toBe('idle');
      expect(empty.ramMobo.state).toBe('idle');
      expect(empty.psuCpu.state).toBe('idle');
      expect(empty.psuGpu.state).toBe('idle');

      const presetIds = findCuratedPreset('am5-1440p', CATALOG_PRODUCTS);
      const resolvedOk = resolveBuildFromSlotIds(presetIds, CATALOG_PRODUCTS);
      const compatOk = analyzePcBuildCompatibility(resolvedOk.record);
      const okTraces = computeTraceStates(resolvedOk.record, compatOk);
      expect(okTraces.cpuMobo.state).toBe('ok');
      expect(okTraces.ramMobo.state).toBe('ok');
      expect(okTraces.psuCpu.state).toBe('ok');
      expect(okTraces.psuGpu.state).toBe('ok');

      const tightPsu: ProductLocal = {
        id: 'psu-tight',
        storeId: STORE_ID,
        name: 'Tight PSU',
        category: 'PSU',
        price: 3000,
        specs: { wattage: Math.max(100, compatOk.estimatedSystemWatts) },
        nameHlc: 'hlc-w',
      };
      const warnRecord = { ...resolvedOk.record, PSU: tightPsu };
      const warnCompat = analyzePcBuildCompatibility(warnRecord);
      const warnTraces = computeTraceStates(warnRecord, warnCompat);
      expect(warnTraces.psuCpu.state).toBe('warning');
      expect(warnTraces.psuGpu.state).toBe('warning');

      const deadPsu: ProductLocal = {
        id: 'psu-low',
        storeId: STORE_ID,
        name: 'Underpowered PSU',
        category: 'PSU',
        price: 1500,
        specs: { wattage: 100 },
        nameHlc: 'hlc-e',
      };
      const errRecord = {
        ...resolvedOk.record,
        RAM: {
          id: 'ram-ddr4-err',
          storeId: STORE_ID,
          name: 'Wrong RAM',
          category: 'RAM',
          price: 2000,
          specs: { ramType: 'DDR4', wattage: 5 },
          nameHlc: 'hlc-r',
        },
        PSU: deadPsu,
      };
      const errTraces = computeTraceStates(errRecord, analyzePcBuildCompatibility(errRecord));
      expect(errTraces.ramMobo.state).toBe('error');
      expect(errTraces.psuCpu.state).toBe('error');
      expect(errTraces.psuGpu.state).toBe('error');
    });
  });

  describe('findCuratedPreset', () => {
    it('builds complete compatible builds with zero warnings for all three presets', () => {
      const presetIds = ['am5-1440p', 'budget-am4', 'rtx5080-flagship'] as const;

      for (const presetId of presetIds) {
        const slots = findCuratedPreset(presetId, CATALOG_PRODUCTS);
        for (const coreSlot of CORE_BUILD_SLOTS) {
          expect(slots[coreSlot]?.length).toBeGreaterThan(0);
        }
        const resolved = resolveBuildFromSlotIds(slots, CATALOG_PRODUCTS);
        const report = analyzePcBuildCompatibility(resolved.record);
        expect(report.isCompatible).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.warnings).toEqual([]);
      }
    });
  });

  describe('autoFillBuildWithinBudget', () => {
    it('preserves locked slots, fills remaining core slots compatibly, prefers stock, and excludes thermal paste / fans alone', () => {
      const am5Cpu = CATALOG_PRODUCTS.find(
        (p) => p.category === 'CPU' && p.specs?.socket?.toUpperCase() === 'AM5'
      )!;
      expect(am5Cpu).toBeDefined();

      const stockMap = buildDefaultStockMap(CATALOG_PRODUCTS);
      const outOfStockCpu = CATALOG_PRODUCTS.find(
        (p) => p.category === 'CPU' && p.id !== am5Cpu.id
      );
      if (outOfStockCpu) stockMap.set(outOfStockCpu.id, 0);

      // Force cheapest AM5 mobo to 0 stock to verify stock preference over out-of-stock
      const am5Mobos = CATALOG_PRODUCTS.filter(
        (p) => p.category === 'Motherboard' && p.specs?.socket?.toUpperCase() === 'AM5'
      );
      if (am5Mobos.length > 1) {
        stockMap.set(am5Mobos[0].id, 0);
      }

      const result = autoFillBuildWithinBudget(
        { CPU: [am5Cpu.id] },
        CATALOG_PRODUCTS,
        stockMap,
        95000
      );

      expect(result.nextSlots.CPU).toEqual([am5Cpu.id]);
      expect(result.filledCount).toBe(7);

      const resolved = resolveBuildFromSlotIds(result.nextSlots, CATALOG_PRODUCTS);
      const compat = analyzePcBuildCompatibility(resolved.record);
      expect(compat.isCompatible).toBe(true);
      expect(compat.errors).toEqual([]);

      const coolerName = Array.isArray(resolved.record.Cooling)
        ? resolved.record.Cooling[0]?.name.toLowerCase()
        : resolved.record.Cooling?.name.toLowerCase();
      expect(coolerName).toBeDefined();
      expect(coolerName).not.toContain('thermal paste');
      expect(coolerName).not.toContain('case fan');
    });
  });

  describe('diffBuildSnapshots', () => {
    it('identifies same, changed, added, removed slots and calculates price and wattage deltas', () => {
      const cpu = CATALOG_PRODUCTS.find((p) => p.category === 'CPU')!;
      const gpus = CATALOG_PRODUCTS.filter((p) => p.category === 'GPU').sort(
        (a, b) => (a.price || 0) - (b.price || 0)
      );
      const lowGpu = gpus[0];
      const highGpu = gpus[gpus.length - 1];
      const storage = CATALOG_PRODUCTS.find((p) => p.category === 'Storage')!;
      const ram = CATALOG_PRODUCTS.find((p) => p.category === 'RAM')!;

      const snapshotA = {
        CPU: [cpu.id],
        GPU: [lowGpu.id],
        Storage: [storage.id],
      };
      const buildB = {
        CPU: [cpu.id],
        GPU: [highGpu.id],
        RAM: [ram.id],
      };

      const diff = diffBuildSnapshots(snapshotA, buildB, CATALOG_PRODUCTS);
      const bySlot = new Map(diff.rows.map((r) => [r.slot, r]));

      expect(bySlot.get('CPU')?.status).toBe('same');
      expect(bySlot.get('GPU')?.status).toBe('changed');
      expect(bySlot.get('RAM')?.status).toBe('added');
      expect(bySlot.get('Storage')?.status).toBe('removed');

      const expectedPriceDelta =
        (highGpu.price || 0) + (ram.price || 0) - ((lowGpu.price || 0) + (storage.price || 0));
      expect(diff.priceDelta).toBe(expectedPriceDelta);

      const expectedWattDelta =
        (highGpu.specs?.wattage || 0) +
        (ram.specs?.wattage || 0) -
        ((lowGpu.specs?.wattage || 0) + (storage.specs?.wattage || 0));
      expect(diff.wattageDelta).toBe(expectedWattDelta);
    });
  });

  describe('computeNextColorSchemeOverride', () => {
    it('covers all six combinations of preference and OS systemScheme cleanly', () => {
      expect(computeNextColorSchemeOverride('system', 'light')).toBe('dark');
      expect(computeNextColorSchemeOverride('system', 'dark')).toBe('light');
      expect(computeNextColorSchemeOverride('dark', 'light')).toBe('system');
      expect(computeNextColorSchemeOverride('light', 'dark')).toBe('system');
      expect(computeNextColorSchemeOverride('dark', 'dark')).toBe('light');
      expect(computeNextColorSchemeOverride('light', 'light')).toBe('dark');
    });
  });
});
