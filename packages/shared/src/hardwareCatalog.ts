import { HardwareCategory, HardwareSpecs, Product } from './types/index.js';

export interface SampleHardwareItem {
  id: string;
  name: string;
  sku: string;
  category: HardwareCategory;
  brand: string;
  price: number;
  costPrice: number;
  warranty: string;
  specs: HardwareSpecs;
  initialStock: number;
  imageUrl?: string;
}

export const HARDWARE_CATEGORIES: HardwareCategory[] = [
  'CPU',
  'Motherboard',
  'GPU',
  'RAM',
  'Storage',
  'PSU',
  'Case',
  'Cooling',
  'Monitor',
  'Peripheral',
];

/**
 * Curated MegaHertz Depot sample PC hardware catalog with realistic Philippine Peso (₱) pricing,
 * compatibility tags (AM5 / LGA1700 / DDR5 / DDR4 / TDP Wattages), and warranty terms.
 */
export const SAMPLE_PC_HARDWARE_CATALOG: SampleHardwareItem[] = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    name: 'AMD Ryzen 7 7800X3D 8-Core 16-Thread Processor',
    sku: 'CPU-AMD-7800X3D',
    category: 'CPU',
    brand: 'AMD',
    price: 23950,
    costPrice: 20500,
    warranty: '3 Years Manufacturer Warranty',
    specs: { socket: 'AM5', wattage: 120 },
    initialStock: 8,
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    name: 'Intel Core i5-14600K 14-Core Processor',
    sku: 'CPU-INT-14600K',
    category: 'CPU',
    brand: 'Intel',
    price: 18490,
    costPrice: 15800,
    warranty: '3 Years Manufacturer Warranty',
    specs: { socket: 'LGA1700', wattage: 181 },
    initialStock: 10,
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    name: 'ASUS ROG Strix B650-A Gaming WiFi Motherboard',
    sku: 'MB-ASUS-B650A',
    category: 'Motherboard',
    brand: 'ASUS',
    price: 14250,
    costPrice: 12100,
    warranty: '3 Years Supplier Warranty',
    specs: { socket: 'AM5', ramType: 'DDR5', wattage: 55, formFactor: 'ATX' },
    initialStock: 6,
  },
  {
    id: '50000000-0000-4000-8000-000000000004',
    name: 'MSI PRO B760M-A WiFi DDR4 mATX Motherboard',
    sku: 'MB-MSI-B760MA-D4',
    category: 'Motherboard',
    brand: 'MSI',
    price: 8950,
    costPrice: 7400,
    warranty: '3 Years Supplier Warranty',
    specs: { socket: 'LGA1700', ramType: 'DDR4', wattage: 45, formFactor: 'mATX' },
    initialStock: 9,
  },
  {
    id: '50000000-0000-4000-8000-000000000005',
    name: 'G.Skill Trident Z5 RGB 32GB (2x16GB) DDR5-6000 CL30',
    sku: 'RAM-GSK-32G-D5',
    category: 'RAM',
    brand: 'G.Skill',
    price: 7650,
    costPrice: 6300,
    warranty: 'Limited Lifetime Warranty',
    specs: { ramType: 'DDR5', wattage: 15 },
    initialStock: 14,
  },
  {
    id: '50000000-0000-4000-8000-000000000006',
    name: 'Kingston Fury Beast 16GB (2x8GB) DDR4-3200 CL16',
    sku: 'RAM-KNG-16G-D4',
    category: 'RAM',
    brand: 'Kingston',
    price: 2690,
    costPrice: 2100,
    warranty: 'Limited Lifetime Warranty',
    specs: { ramType: 'DDR4', wattage: 10 },
    initialStock: 20,
  },
  {
    id: '50000000-0000-4000-8000-000000000007',
    name: 'GIGABYTE GeForce RTX 4070 SUPER Windforce OC 12GB',
    sku: 'GPU-GB-4070S',
    category: 'GPU',
    brand: 'GIGABYTE',
    price: 38950,
    costPrice: 34200,
    warranty: '3 Years Manufacturer Warranty',
    specs: { wattage: 220 },
    initialStock: 5,
  },
  {
    id: '50000000-0000-4000-8000-000000000008',
    name: 'Sapphire Pulse Radeon RX 7800 XT 16GB GDDR6',
    sku: 'GPU-SAP-7800XT',
    category: 'GPU',
    brand: 'Sapphire',
    price: 32500,
    costPrice: 28400,
    warranty: '2 Years Supplier Warranty',
    specs: { wattage: 263 },
    initialStock: 4,
  },
  {
    id: '50000000-0000-4000-8000-000000000009',
    name: 'Samsung 990 PRO 1TB PCIe 4.0 NVMe M.2 SSD',
    sku: 'SSD-SAM-990P-1T',
    category: 'Storage',
    brand: 'Samsung',
    price: 6490,
    costPrice: 5300,
    warranty: '5 Years Limited Warranty',
    specs: { wattage: 8 },
    initialStock: 18,
  },
  {
    id: '50000000-0000-4000-8000-000000000010',
    name: 'Corsair RM750e 750W 80+ Gold ATX 3.0 Fully Modular PSU',
    sku: 'PSU-COR-RM750E',
    category: 'PSU',
    brand: 'Corsair',
    price: 6850,
    costPrice: 5600,
    warranty: '7 Years Manufacturer Warranty',
    specs: { wattage: 750, formFactor: 'ATX' },
    initialStock: 11,
  },
  {
    id: '50000000-0000-4000-8000-000000000011',
    name: 'NZXT H6 Flow Dual-Chamber Mid-Tower ATX Case (Black)',
    sku: 'CASE-NZXT-H6F',
    category: 'Case',
    brand: 'NZXT',
    price: 6450,
    costPrice: 5200,
    warranty: '2 Years Store Warranty',
    specs: { formFactor: 'ATX', wattage: 0 },
    initialStock: 7,
  },
  {
    id: '50000000-0000-4000-8000-000000000012',
    name: 'DeepCool AK620 Dual-Tower CPU Air Cooler',
    sku: 'COOL-DC-AK620',
    category: 'Cooling',
    brand: 'DeepCool',
    price: 3490,
    costPrice: 2700,
    warranty: '3 Years Store Warranty',
    specs: { wattage: 10 },
    initialStock: 12,
  },
  {
    id: '50000000-0000-4000-8000-000000000013',
    name: 'ASUS TUF Gaming VG27AQ3A 27" QHD 180Hz IPS Monitor',
    sku: 'MON-ASUS-VG27AQ',
    category: 'Monitor',
    brand: 'ASUS',
    price: 15950,
    costPrice: 13500,
    warranty: '3 Years Onsite Warranty',
    specs: { wattage: 35 },
    initialStock: 6,
  },
  {
    id: '50000000-0000-4000-8000-000000000014',
    name: 'Logitech G Pro X Superlight 2 Wireless Gaming Mouse',
    sku: 'PER-LOG-GPX2',
    category: 'Peripheral',
    brand: 'Logitech',
    price: 7990,
    costPrice: 6500,
    warranty: '2 Years Hardware Warranty',
    specs: { wattage: 0 },
    initialStock: 15,
  },
];

export interface PcBuildCompatibilityReport {
  isCompatible: boolean;
  errors: string[];
  warnings: string[];
  estimatedSystemWatts: number;
  recommendedPsuWatts: number;
  selectedPsuWatts: number | null;
}

/**
 * Evaluates socket compatibility, RAM generation match, and PSU wattage headroom
 * for a selected set of PC Rig Builder parts.
 */
export function analyzePcBuildCompatibility(
  selectedParts: Partial<Record<HardwareCategory, Pick<Product, 'name' | 'category' | 'specs'>>>
): PcBuildCompatibilityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cpu = selectedParts.CPU;
  const mobo = selectedParts.Motherboard;
  const ram = selectedParts.RAM;
  const psu = selectedParts.PSU;

  // 1. CPU <-> Motherboard Socket Check
  if (cpu?.specs?.socket && mobo?.specs?.socket) {
    if (cpu.specs.socket.toUpperCase() !== mobo.specs.socket.toUpperCase()) {
      errors.push(
        `Socket Mismatch: ${cpu.name} uses ${cpu.specs.socket}, but ${mobo.name} uses ${mobo.specs.socket}.`
      );
    }
  }

  // 2. Motherboard <-> RAM Generation Check
  if (mobo?.specs?.ramType && ram?.specs?.ramType) {
    if (mobo.specs.ramType.toUpperCase() !== ram.specs.ramType.toUpperCase()) {
      errors.push(
        `Memory Type Mismatch: ${mobo.name} requires ${mobo.specs.ramType}, but ${ram.name} is ${ram.specs.ramType}.`
      );
    }
  }

  // 3. Calculate Estimated Component Wattage (excluding PSU and Monitor)
  let estimatedSystemWatts = 0;
  for (const [cat, part] of Object.entries(selectedParts)) {
    if (!part || cat === 'PSU' || cat === 'Monitor') continue;
    if (part.specs?.wattage && part.specs.wattage > 0) {
      estimatedSystemWatts += part.specs.wattage;
    }
  }

  const recommendedPsuWatts =
    estimatedSystemWatts > 0 ? Math.ceil((estimatedSystemWatts * 1.25) / 50) * 50 : 0;
  const selectedPsuWatts = psu?.specs?.wattage ?? null;

  if (selectedPsuWatts !== null && estimatedSystemWatts > 0) {
    if (selectedPsuWatts < estimatedSystemWatts) {
      errors.push(
        `Insufficient Power Supply: Selected PSU (${selectedPsuWatts}W) is below estimated system load (${estimatedSystemWatts}W).`
      );
    } else if (selectedPsuWatts < recommendedPsuWatts) {
      warnings.push(
        `Tight PSU Headroom: Selected PSU is ${selectedPsuWatts}W; we recommend at least ${recommendedPsuWatts}W (25% transient headroom).`
      );
    }
  }

  return {
    isCompatible: errors.length === 0,
    errors,
    warnings,
    estimatedSystemWatts,
    recommendedPsuWatts,
    selectedPsuWatts,
  };
}

export function formatCurrency(amount: number, symbol: string = '₱'): string {
  return `${symbol}${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

