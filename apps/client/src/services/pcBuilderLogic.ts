import {
  HardwareCategory,
  PcBuildCompatibilityReport,
  PcBuildSlotPart,
  analyzePcBuildCompatibility,
} from '@countwise/shared';
import { ProductLocal } from '../db/index.js';

export const CORE_BUILD_SLOTS: HardwareCategory[] = [
  'CPU',
  'Motherboard',
  'GPU',
  'RAM',
  'Storage',
  'PSU',
  'Case',
  'Cooling',
];

export const DESK_SLOTS: HardwareCategory[] = ['Monitor', 'Peripheral'];

export const ALL_WORKBENCH_SLOTS: HardwareCategory[] = [...CORE_BUILD_SLOTS, ...DESK_SLOTS];

export const MULTI_SLOT_CATEGORIES = new Set<HardwareCategory>([
  'Cooling',
  'Storage',
  'Peripheral',
  'Monitor',
]);

export type CompatibilitySeverity = 'ok' | 'warning' | 'error';

export interface CandidateCompatibility {
  compatible: boolean;
  severity: CompatibilitySeverity;
  reasons: string[];
}

export type TraceStateKind = 'idle' | 'ok' | 'warning' | 'error';

export interface TraceState {
  state: TraceStateKind;
  label: string;
}

export interface WorkbenchTraceStates {
  cpuMobo: TraceState;
  ramMobo: TraceState;
  psuCpu: TraceState;
  psuGpu: TraceState;
}

export type CuratedPresetId = 'budget-am4' | 'am5-1440p' | 'rtx5080-flagship';

export interface BuildSlotDiff {
  slot: HardwareCategory;
  partsA: ProductLocal[];
  partsB: ProductLocal[];
  priceA: number;
  priceB: number;
  status: 'same' | 'changed' | 'added' | 'removed';
}

export interface BuildSnapshotComparison {
  totalA: number;
  totalB: number;
  priceDelta: number;
  wattageA: number;
  wattageB: number;
  wattageDelta: number;
  rows: BuildSlotDiff[];
}

export function getSlotPartList(val?: PcBuildSlotPart | ProductLocal[] | ProductLocal): ProductLocal[] {
  if (!val) return [];
  return Array.isArray(val) ? (val as ProductLocal[]) : [val as ProductLocal];
}

export function getFirstSlotPart(val?: PcBuildSlotPart | ProductLocal[] | ProductLocal): ProductLocal | undefined {
  return Array.isArray(val) ? (val[0] as ProductLocal | undefined) : (val as ProductLocal | undefined);
}

/**
 * Resolves slot-ID map to `ProductLocal` records compatible with `analyzePcBuildCompatibility`.
 */
export function resolveBuildFromSlotIds(
  selectedBySlot: Partial<Record<HardwareCategory, string[]>>,
  products: ProductLocal[]
): {
  record: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>>;
  list: Array<{ slot: HardwareCategory; product: ProductLocal }>;
} {
  const byId = new Map(products.map((p) => [p.id, p]));
  const record: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>> = {};
  const list: Array<{ slot: HardwareCategory; product: ProductLocal }> = [];

  for (const cat of ALL_WORKBENCH_SLOTS) {
    const pids = selectedBySlot[cat];
    if (!pids || pids.length === 0) continue;
    const foundList: ProductLocal[] = [];
    for (const pid of pids) {
      const found = byId.get(pid);
      if (found) {
        foundList.push(found);
        list.push({ slot: cat, product: found });
      }
    }
    if (foundList.length > 0) {
      record[cat] = MULTI_SLOT_CATEGORIES.has(cat) ? foundList : foundList[0];
    }
  }

  return { record, list };
}

/**
 * Evaluates whether a single candidate hardware product is compatible with the active build.
 */
export function evaluatePartCompatibility(
  candidate: ProductLocal,
  buildRecord: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>>,
  compatibility: PcBuildCompatibilityReport
): CandidateCompatibility {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cpu = getFirstSlotPart(buildRecord.CPU);
  const mobo = getFirstSlotPart(buildRecord.Motherboard);
  const ramList = getSlotPartList(buildRecord.RAM);
  const psu = getFirstSlotPart(buildRecord.PSU);

  const pushError = (msg: string) => {
    errors.push(msg);
  };

  const pushWarning = (msg: string) => {
    warnings.push(msg);
  };

  const category = candidate.category;
  const candSocket = candidate.specs?.socket?.trim().toUpperCase();
  const candRamType = candidate.specs?.ramType?.trim().toUpperCase();
  const candWattage = candidate.specs?.wattage ?? 0;

  if (category === 'CPU') {
    const moboSocket = mobo?.specs?.socket?.trim().toUpperCase();
    if (candSocket && moboSocket && candSocket !== moboSocket) {
      pushError(`Needs ${candSocket} board (installed: ${moboSocket})`);
    }
  } else if (category === 'Motherboard') {
    const cpuSocket = cpu?.specs?.socket?.trim().toUpperCase();
    if (candSocket && cpuSocket && candSocket !== cpuSocket) {
      pushError(`Needs ${candSocket} CPU (installed: ${cpuSocket})`);
    }
    for (const ram of ramList) {
      const ramType = ram.specs?.ramType?.trim().toUpperCase();
      if (candRamType && ramType && candRamType !== ramType) {
        pushError(`Needs ${candRamType} RAM (installed: ${ramType})`);
        break;
      }
    }
  } else if (category === 'RAM') {
    const moboRam = mobo?.specs?.ramType?.trim().toUpperCase();
    if (candRamType && moboRam && candRamType !== moboRam) {
      pushError(`Board requires ${moboRam}`);
    }
  }

  if (category === 'PSU') {
    if (candWattage > 0 && compatibility.estimatedSystemWatts > 0) {
      if (candWattage < compatibility.estimatedSystemWatts) {
        pushError(`Below ${compatibility.estimatedSystemWatts}W load`);
      } else if (candWattage < compatibility.recommendedPsuWatts) {
        pushWarning(`Below ${compatibility.recommendedPsuWatts}W rec.`);
      }
    }
  } else if (
    category &&
    category !== 'Monitor' &&
    category !== 'Laptop' &&
    psu?.specs?.wattage &&
    candWattage > 0
  ) {
    const existingSlotWatts = MULTI_SLOT_CATEGORIES.has(category)
      ? 0
      : getFirstSlotPart(buildRecord[category])?.specs?.wattage || 0;
    const simulatedWatts = Math.max(
      0,
      compatibility.estimatedSystemWatts - existingSlotWatts + candWattage
    );
    const simulatedRec =
      simulatedWatts > 0 ? Math.ceil((simulatedWatts * 1.25) / 50) * 50 : 0;

    if (psu.specs.wattage < simulatedWatts) {
      pushError(`Exceeds ${psu.specs.wattage}W PSU`);
    } else if (psu.specs.wattage < simulatedRec) {
      pushWarning(`Tight on ${psu.specs.wattage}W PSU`);
    }
  }

  const severity: CompatibilitySeverity =
    errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
  const reasons = [...errors, ...warnings];

  return {
    compatible: errors.length === 0,
    severity,
    reasons,
  };
}

/**
 * Computes live compatibility & power rail trace states rendered on the CAD Workbench SVG overlay.
 */
export function computeTraceStates(
  buildRecord: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>>,
  compatibility: PcBuildCompatibilityReport
): WorkbenchTraceStates {
  const cpu = getFirstSlotPart(buildRecord.CPU);
  const mobo = getFirstSlotPart(buildRecord.Motherboard);
  const ram = getFirstSlotPart(buildRecord.RAM);
  const gpu = getFirstSlotPart(buildRecord.GPU);
  const psu = getFirstSlotPart(buildRecord.PSU);

  const cpuSocket = cpu?.specs?.socket?.trim().toUpperCase();
  const moboSocket = mobo?.specs?.socket?.trim().toUpperCase();
  const moboRam = mobo?.specs?.ramType?.trim().toUpperCase();
  const ramType = ram?.specs?.ramType?.trim().toUpperCase();

  let cpuMobo: TraceState;
  if (cpu && mobo) {
    if (cpuSocket && moboSocket && cpuSocket !== moboSocket) {
      cpuMobo = { state: 'error', label: `${cpuSocket} != ${moboSocket}` };
    } else {
      cpuMobo = { state: 'ok', label: `${moboSocket || cpuSocket || 'CPU'} OK` };
    }
  } else if (cpu || mobo) {
    cpuMobo = { state: 'idle', label: `${cpuSocket || moboSocket || 'Socket'} bus` };
  } else {
    cpuMobo = { state: 'idle', label: 'Socket bus' };
  }

  let ramMobo: TraceState;
  if (mobo && ram) {
    if (moboRam && ramType && moboRam !== ramType) {
      ramMobo = { state: 'error', label: `${moboRam} != ${ramType}` };
    } else {
      ramMobo = { state: 'ok', label: `${ramType || moboRam || 'DIMM'} OK` };
    }
  } else if (mobo || ram) {
    ramMobo = { state: 'idle', label: `${moboRam || ramType || 'Memory'} bus` };
  } else {
    ramMobo = { state: 'idle', label: 'Memory bus' };
  }

  let psuStatus: TraceStateKind = 'idle';
  if (psu?.specs?.wattage && compatibility.estimatedSystemWatts > 0) {
    if (psu.specs.wattage < compatibility.estimatedSystemWatts) {
      psuStatus = 'error';
    } else if (psu.specs.wattage < compatibility.recommendedPsuWatts) {
      psuStatus = 'warning';
    } else {
      psuStatus = 'ok';
    }
  } else if (psu) {
    psuStatus = 'ok';
  }

  const psuCpu: TraceState =
    psu && cpu
      ? {
          state: psuStatus,
          label:
            psuStatus === 'error'
              ? 'PSU low'
              : psuStatus === 'warning'
              ? 'Tight headroom'
              : cpu.specs?.wattage
              ? `${cpu.specs.wattage}W EPS`
              : 'EPS 12V',
        }
      : { state: 'idle', label: 'EPS 12V' };

  const psuGpu: TraceState =
    psu && gpu
      ? {
          state: psuStatus,
          label:
            psuStatus === 'error'
              ? 'PSU low'
              : psuStatus === 'warning'
              ? 'Tight headroom'
              : gpu.specs?.wattage
              ? `${gpu.specs.wattage}W PCIe`
              : 'PCIe 12V',
        }
      : { state: 'idle', label: 'PCIe 12V' };

  return { cpuMobo, ramMobo, psuCpu, psuGpu };
}

const AUTO_FILL_ORDER: HardwareCategory[] = [
  'CPU',
  'Motherboard',
  'RAM',
  'GPU',
  'Storage',
  'Cooling',
  'Case',
  'PSU',
];

const BUDGET_WEIGHTS: Record<HardwareCategory, number> = {
  GPU: 0.34,
  CPU: 0.22,
  Motherboard: 0.14,
  RAM: 0.09,
  Storage: 0.07,
  PSU: 0.07,
  Case: 0.04,
  Cooling: 0.03,
  Monitor: 0,
  Peripheral: 0,
  Laptop: 0,
};

/**
 * Fills empty core slots cleanly within remaining target budget while locking user-chosen parts
 * and enforcing CPU socket, RAM type, and PSU wattage rules.
 */
export function autoFillBuildWithinBudget(
  currentSlots: Partial<Record<HardwareCategory, string[]>>,
  products: ProductLocal[],
  stockMap: Map<string, number>,
  targetBudget: number
): {
  nextSlots: Partial<Record<HardwareCategory, string[]>>;
  totalPrice: number;
  estimatedWatts: number;
  filledCount: number;
} {
  const nextSlots: Partial<Record<HardwareCategory, string[]>> = {};
  for (const cat of ALL_WORKBENCH_SLOTS) {
    if (currentSlots[cat] && currentSlots[cat]!.length > 0) {
      nextSlots[cat] = [...currentSlots[cat]!];
    }
  }

  const lockedResolved = resolveBuildFromSlotIds(nextSlots, products);
  const lockedSpend = lockedResolved.list.reduce((sum, e) => sum + (e.product.price || 0), 0);
  let remainingBudget = Math.max(0, targetBudget - lockedSpend);

  const emptyOrder = AUTO_FILL_ORDER.filter(
    (cat) => !nextSlots[cat] || nextSlots[cat]!.length === 0
  );
  const totalWeight = emptyOrder.reduce((sum, cat) => sum + (BUDGET_WEIGHTS[cat] || 0.05), 0);

  let remainingWeight = totalWeight;
  let filledCount = 0;

  for (const cat of emptyOrder) {
    const { record } = resolveBuildFromSlotIds(nextSlots, products);
    const report = analyzePcBuildCompatibility(record);

    const catCandidates = products.filter((p) => {
      if (p.category !== cat) return false;
      if (cat === 'Cooling') {
        const lower = p.name.toLowerCase();
        if (lower.includes('thermal paste') || lower.includes('case fan')) {
          return false;
        }
      }
      return evaluatePartCompatibility(p, record, report).compatible;
    });

    const fallbackCandidates =
      catCandidates.length > 0
        ? catCandidates
        : products.filter((p) => p.category === cat);

    if (fallbackCandidates.length === 0) continue;

    const weight = BUDGET_WEIGHTS[cat] || 0.05;
    const sliceTarget =
      remainingWeight > 0 ? remainingBudget * (weight / remainingWeight) : remainingBudget;
    remainingWeight = Math.max(0, remainingWeight - weight);

    const scored = fallbackCandidates.map((cand) => {
      const price = cand.price || 0;
      const stock = stockMap.get(cand.id) ?? 0;
      const evalResult = evaluatePartCompatibility(cand, record, report);

      let score = 0;
      if (stock > 0) score += 200;
      if (evalResult.severity === 'ok') score += 150;
      else if (evalResult.severity === 'warning') score += 40;

      if (price <= remainingBudget) {
        score += 100;
        const diffRatio = sliceTarget > 0 ? Math.abs(price - sliceTarget) / sliceTarget : 0;
        score += Math.max(0, 60 - diffRatio * 50);
      } else {
        score -= (price - remainingBudget) / 1000;
      }

      // Bonus for ATX motherboard/AM5 balanced value or higher GPU performance within budget
      if (cat === 'PSU' && cand.specs?.wattage && report.recommendedPsuWatts > 0) {
        if (cand.specs.wattage >= report.recommendedPsuWatts) score += 90;
      }

      return { cand, score };
    });

    scored.sort((a, b) => b.score - a.score || (a.cand.price || 0) - (b.cand.price || 0));
    const chosen = scored[0]?.cand;
    if (chosen) {
      nextSlots[cat] = [chosen.id];
      remainingBudget = Math.max(0, remainingBudget - (chosen.price || 0));
      filledCount += 1;
    }
  }

  const finalResolved = resolveBuildFromSlotIds(nextSlots, products);
  const finalReport = analyzePcBuildCompatibility(finalResolved.record);
  const totalPrice = finalResolved.list.reduce((sum, e) => sum + (e.product.price || 0), 0);

  return {
    nextSlots,
    totalPrice,
    estimatedWatts: finalReport.estimatedSystemWatts,
    filledCount,
  };
}

/**
 * Selects curated, compatibility-verified preset components from the live catalog.
 */
export function findCuratedPreset(
  presetId: CuratedPresetId,
  products: ProductLocal[]
): Partial<Record<HardwareCategory, string[]>> {
  const next: Partial<Record<HardwareCategory, string[]>> = {};

  const pickMainCooler = (preferAio: boolean) => {
    const candidates = products.filter(
      (p) =>
        p.category === 'Cooling' &&
        !p.name.toLowerCase().includes('case fan') &&
        !p.name.toLowerCase().includes('thermal paste')
    );
    if (candidates.length === 0) return products.find((p) => p.category === 'Cooling');
    const sorted = [...candidates].sort((a, b) =>
      preferAio ? (b.price || 0) - (a.price || 0) : (a.price || 0) - (b.price || 0)
    );
    return sorted[0];
  };

  const pickAdequatePsu = (minFloorWatts: number, preferHighestWattage: boolean) => {
    const resolvedWithoutPsu = resolveBuildFromSlotIds(next, products);
    const report = analyzePcBuildCompatibility(resolvedWithoutPsu.record);
    const requiredWatts = Math.max(minFloorWatts, report.recommendedPsuWatts);
    const allPsus = products.filter((p) => p.category === 'PSU');
    const qualifiedPsus = allPsus.filter((p) => (p.specs?.wattage || 0) >= requiredWatts);

    if (qualifiedPsus.length > 0) {
      const sorted = [...qualifiedPsus].sort((a, b) =>
        preferHighestWattage
          ? (b.specs?.wattage || 0) - (a.specs?.wattage || 0) || (b.price || 0) - (a.price || 0)
          : (a.price || 0) - (b.price || 0) || (a.specs?.wattage || 0) - (b.specs?.wattage || 0)
      );
      return sorted[0];
    }

    return [...allPsus].sort((a, b) => (b.specs?.wattage || 0) - (a.specs?.wattage || 0))[0];
  };

  if (presetId === 'budget-am4') {
    const cpu =
      products.find((p) => p.category === 'CPU' && p.specs?.socket?.toUpperCase() === 'AM4') ||
      products.find((p) => p.category === 'CPU' && p.specs?.socket?.toUpperCase() === 'LGA1700') ||
      products.find((p) => p.category === 'CPU');
    const targetSocket = cpu?.specs?.socket?.toUpperCase();
    const mobo =
      products.find(
        (p) =>
          p.category === 'Motherboard' &&
          (!targetSocket || p.specs?.socket?.toUpperCase() === targetSocket)
      ) || products.find((p) => p.category === 'Motherboard');
    const targetRam = mobo?.specs?.ramType?.toUpperCase() || 'DDR4';
    const ram =
      products.find((p) => p.category === 'RAM' && p.specs?.ramType?.toUpperCase() === targetRam) ||
      products.find((p) => p.category === 'RAM');
    const gpus = products
      .filter((p) => p.category === 'GPU')
      .sort((a, b) => (a.price || 0) - (b.price || 0));
    const gpu = gpus[Math.min(Math.floor(gpus.length / 3), Math.max(0, gpus.length - 1))];
    const storage = [...products]
      .filter((p) => p.category === 'Storage')
      .sort((a, b) => (a.price || 0) - (b.price || 0))[0];
    const pcCase = [...products]
      .filter((p) => p.category === 'Case')
      .sort((a, b) => (a.price || 0) - (b.price || 0))[0];
    const cooler = pickMainCooler(false);

    if (cpu) next.CPU = [cpu.id];
    if (mobo) next.Motherboard = [mobo.id];
    if (ram) next.RAM = [ram.id];
    if (gpu) next.GPU = [gpu.id];
    if (storage) next.Storage = [storage.id];
    if (pcCase) next.Case = [pcCase.id];
    if (cooler) next.Cooling = [cooler.id];

    const psu = pickAdequatePsu(550, false);
    if (psu) next.PSU = [psu.id];
    return next;
  }

  if (presetId === 'rtx5080-flagship') {
    const cpus = products
      .filter((p) => p.category === 'CPU' && p.specs?.socket?.toUpperCase() === 'AM5')
      .sort((a, b) => (b.price || 0) - (a.price || 0));
    const cpu =
      cpus[0] ||
      [...products]
        .filter((p) => p.category === 'CPU')
        .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const targetSocket = cpu?.specs?.socket?.toUpperCase();
    const mobo = [...products]
      .filter(
        (p) =>
          p.category === 'Motherboard' &&
          (!targetSocket || p.specs?.socket?.toUpperCase() === targetSocket)
      )
      .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const targetRam = mobo?.specs?.ramType?.toUpperCase() || 'DDR5';
    const ram = [...products]
      .filter((p) => p.category === 'RAM' && p.specs?.ramType?.toUpperCase() === targetRam)
      .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const gpu =
      products.find((p) => p.category === 'GPU' && p.sku === 'GPU-ASUS-5080') ||
      [...products]
        .filter((p) => p.category === 'GPU')
        .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const storage = [...products]
      .filter((p) => p.category === 'Storage')
      .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const pcCase = [...products]
      .filter((p) => p.category === 'Case')
      .sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const cooler = pickMainCooler(true);

    if (cpu) next.CPU = [cpu.id];
    if (mobo) next.Motherboard = [mobo.id];
    if (ram) next.RAM = [ram.id];
    if (gpu) next.GPU = [gpu.id];
    if (storage) next.Storage = [storage.id];
    if (pcCase) next.Case = [pcCase.id];
    if (cooler) next.Cooling = [cooler.id];

    const psu = pickAdequatePsu(850, true);
    if (psu) next.PSU = [psu.id];
    return next;
  }

  // Default: 'am5-1440p'
  const cpu = products.find(
    (p) => p.category === 'CPU' && p.specs?.socket?.toUpperCase() === 'AM5'
  );
  const mobo = products.find(
    (p) => p.category === 'Motherboard' && p.specs?.socket?.toUpperCase() === 'AM5'
  );
  const targetRamType = mobo?.specs?.ramType || 'DDR5';
  const ram = products.find(
    (p) => p.category === 'RAM' && p.specs?.ramType?.toUpperCase() === targetRamType.toUpperCase()
  );
  const gpu = products.find((p) => p.category === 'GPU');
  const storage = products.find((p) => p.category === 'Storage');
  const pcCase = products.find((p) => p.category === 'Case');
  const cooler = pickMainCooler(false);
  const caseFans = products.find(
    (p) => p.category === 'Cooling' && p.name.toLowerCase().includes('case fan')
  );

  if (cpu) next.CPU = [cpu.id];
  if (mobo) next.Motherboard = [mobo.id];
  if (ram) next.RAM = [ram.id];
  if (gpu) next.GPU = [gpu.id];
  if (storage) next.Storage = [storage.id];
  if (pcCase) next.Case = [pcCase.id];
  if (cooler || caseFans) {
    next.Cooling = [cooler?.id, caseFans?.id].filter((id): id is string => Boolean(id));
  }

  const psu = pickAdequatePsu(750, false);
  if (psu) next.PSU = [psu.id];
  return next;
}

/**
 * Compares Snapshot A vs Current Build B slot by slot with price and wattage deltas.
 */
export function diffBuildSnapshots(
  snapshotA: Partial<Record<HardwareCategory, string[]>>,
  currentB: Partial<Record<HardwareCategory, string[]>>,
  products: ProductLocal[]
): BuildSnapshotComparison {
  const resolvedA = resolveBuildFromSlotIds(snapshotA, products);
  const resolvedB = resolveBuildFromSlotIds(currentB, products);
  const compatA = analyzePcBuildCompatibility(resolvedA.record);
  const compatB = analyzePcBuildCompatibility(resolvedB.record);

  let totalA = 0;
  let totalB = 0;

  const rows: BuildSlotDiff[] = ALL_WORKBENCH_SLOTS.map((slot) => {
    const partsA = getSlotPartList(resolvedA.record[slot]);
    const partsB = getSlotPartList(resolvedB.record[slot]);
    const priceA = partsA.reduce((sum, p) => sum + (p.price || 0), 0);
    const priceB = partsB.reduce((sum, p) => sum + (p.price || 0), 0);

    totalA += priceA;
    totalB += priceB;

    const idsA = partsA.map((p) => p.id).join(',');
    const idsB = partsB.map((p) => p.id).join(',');

    let status: BuildSlotDiff['status'] = 'same';
    if (idsA !== idsB) {
      if (partsA.length === 0 && partsB.length > 0) status = 'added';
      else if (partsA.length > 0 && partsB.length === 0) status = 'removed';
      else status = 'changed';
    }

    return { slot, partsA, partsB, priceA, priceB, status };
  });

  return {
    totalA,
    totalB,
    priceDelta: totalB - totalA,
    wattageA: compatA.estimatedSystemWatts,
    wattageB: compatB.estimatedSystemWatts,
    wattageDelta: compatB.estimatedSystemWatts - compatA.estimatedSystemWatts,
    rows,
  };
}
