import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  Cpu,
  Fan,
  Grid,
  HardDrive,
  Layers,
  Monitor,
  MousePointer,
  Plus,
  Server,
  Sparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { HardwareCategory, PcBuildCompatibilityReport, formatCurrency } from '@countwise/shared';
import { ProductLocal } from '../db/index.js';
import {
  ALL_WORKBENCH_SLOTS,
  DESK_SLOTS,
  MULTI_SLOT_CATEGORIES,
  TraceState,
  computeTraceStates,
  getSlotPartList,
} from '../services/pcBuilderLogic.js';
import { ProductImage } from './ProductImage.js';

interface PcRigWorkbenchProps {
  selectedParts: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>>;
  activeCategory: HardwareCategory;
  onSelectCategory: (cat: HardwareCategory) => void;
  onRemovePart: (cat: HardwareCategory, productId?: string) => void;
  compatibility: PcBuildCompatibilityReport;
  currencySymbol: string;
  viewMode: 'assembled' | 'exploded';
  onChangeViewMode: (mode: 'assembled' | 'exploded') => void;
}

const SLOT_ORDER_LABELS: Record<HardwareCategory, { code: string; label: string; hint: string }> = {
  Case: { code: '01', label: 'Chassis', hint: 'Tower frame & airflow clearance' },
  Motherboard: { code: '02', label: 'Motherboard', hint: 'Socket & memory backplane' },
  CPU: { code: '03', label: 'Processor', hint: 'Compute socket' },
  RAM: { code: '04', label: 'Memory', hint: 'DIMM channels' },
  GPU: { code: '05', label: 'Graphics Card', hint: 'PCIe x16 primary slot' },
  Storage: { code: '06', label: 'Storage', hint: 'NVMe & SATA drive bay' },
  PSU: { code: '07', label: 'Power Supply', hint: 'Isolated power shroud' },
  Cooling: { code: '08', label: 'Cooling', hint: 'Radiator & airflow fans' },
  Monitor: { code: '09', label: 'Display', hint: 'Primary & dual monitors' },
  Peripheral: { code: '10', label: 'Peripherals', hint: 'Input deck & audio' },
  Laptop: { code: '11', label: 'Laptop', hint: 'Portable system' },
};

export function getCategoryIcon(cat: HardwareCategory, className = 'w-4 h-4 shrink-0'): React.ReactNode {
  switch (cat) {
    case 'CPU':
      return <Cpu className={className} strokeWidth={1.75} />;
    case 'Motherboard':
      return <Server className={className} strokeWidth={1.75} />;
    case 'RAM':
      return <Layers className={className} strokeWidth={1.75} />;
    case 'GPU':
      return <Sparkles className={className} strokeWidth={1.75} />;
    case 'Storage':
      return <HardDrive className={className} strokeWidth={1.75} />;
    case 'PSU':
      return <Zap className={className} strokeWidth={1.75} />;
    case 'Cooling':
      return <Fan className={className} strokeWidth={1.75} />;
    case 'Case':
      return <Box className={className} strokeWidth={1.75} />;
    case 'Monitor':
      return <Monitor className={className} strokeWidth={1.75} />;
    case 'Peripheral':
    default:
      return <MousePointer className={className} strokeWidth={1.75} />;
  }
}

function getTraceStrokeColor(state: TraceState['state']): string {
  switch (state) {
    case 'ok':
      return '#10b981';
    case 'warning':
      return '#f59e0b';
    case 'error':
      return '#f43f5e';
    case 'idle':
    default:
      return '#71717a';
  }
}

function getTracePillClasses(state: TraceState['state']): string {
  switch (state) {
    case 'ok':
      return 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300';
    case 'warning':
      return 'border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300';
    case 'error':
      return 'border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300';
    case 'idle':
    default:
      return 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400';
  }
}

function formatSpecSummary(part: ProductLocal): string[] {
  const pills: string[] = [];
  if (part.specs?.socket) pills.push(part.specs.socket);
  if (part.specs?.ramType) pills.push(part.specs.ramType);
  if (part.specs?.formFactor) pills.push(part.specs.formFactor);
  if (part.specs?.wattage) pills.push(`${part.specs.wattage}W`);
  return pills;
}

export const PcRigWorkbench: React.FC<PcRigWorkbenchProps> = ({
  selectedParts,
  activeCategory,
  onSelectCategory,
  onRemovePart,
  compatibility,
  currencySymbol,
  viewMode,
  onChangeViewMode,
}) => {
  const [hoveredZone, setHoveredZone] = useState<HardwareCategory | null>(null);

  const traces = computeTraceStates(selectedParts, compatibility);
  const installedZoneCount = ALL_WORKBENCH_SLOTS.filter(
    (cat) => getSlotPartList(selectedParts[cat]).length > 0
  ).length;

  const getPartList = (cat: HardwareCategory): ProductLocal[] =>
    getSlotPartList(selectedParts[cat]);
  const hasPart = (cat: HardwareCategory) => getPartList(cat).length > 0;
  const getPartCount = (cat: HardwareCategory) => getPartList(cat).length;

  const cpuPart = getPartList('CPU')[0];
  const ramPart = getPartList('RAM')[0];
  const psuPart = getPartList('PSU')[0];

  const isZoneActive = (cat: HardwareCategory) => activeCategory === cat;
  const isZoneHovered = (cat: HardwareCategory) => hoveredZone === cat;

  const isZoneError = (cat: HardwareCategory): boolean => {
    switch (cat) {
      case 'CPU':
        return traces.cpuMobo.state === 'error';
      case 'RAM':
        return traces.ramMobo.state === 'error';
      case 'Motherboard':
        return traces.cpuMobo.state === 'error' || traces.ramMobo.state === 'error';
      case 'PSU':
        return traces.psuCpu.state === 'error' || traces.psuGpu.state === 'error';
      default:
        return false;
    }
  };

  const getZoneStroke = (cat: HardwareCategory): string => {
    if (isZoneError(cat)) return '#f43f5e';
    if (isZoneActive(cat)) return '#f59e0b';
    if (isZoneHovered(cat)) return '#fbbf24';
    if (hasPart(cat)) return '#d97706';
    return 'var(--bp-idle-stroke)';
  };

  const getZoneFill = (cat: HardwareCategory): string => {
    if (isZoneError(cat)) return 'rgba(244, 63, 94, 0.14)';
    if (isZoneActive(cat) || isZoneHovered(cat)) return 'rgba(245, 158, 11, 0.14)';
    if (hasPart(cat)) return 'rgba(217, 119, 6, 0.10)';
    return cat === 'Case' ? 'var(--bp-case-fill)' : 'var(--bp-zone-idle-fill)';
  };

  const getLabelFill = (cat: HardwareCategory, preferAccent = false): string => {
    if (isZoneError(cat)) return '#f43f5e';
    if (preferAccent || hasPart(cat) || isZoneActive(cat) || isZoneHovered(cat)) {
      return 'var(--bp-accent-label)';
    }
    return 'var(--bp-label)';
  };

  const getPinClasses = (cat: HardwareCategory, filledOverride?: boolean): string => {
    const filled = filledOverride ?? hasPart(cat);
    if (isZoneError(cat)) {
      return 'bg-rose-500 text-white border-rose-300 ring-2 ring-rose-500/30';
    }
    if (filled) {
      return 'bg-amber-500 text-zinc-950 border-amber-300 ring-2 ring-amber-500/30';
    }
    if (isZoneActive(cat) || isZoneHovered(cat)) {
      return 'bg-zinc-900 dark:bg-zinc-100 text-amber-400 dark:text-amber-600 border-amber-500 ring-2 ring-amber-500/20';
    }
    return 'bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:border-amber-500';
  };

  const inspectedZone = hoveredZone ?? activeCategory;
  const inspectedList = getPartList(inspectedZone);
  const inspectedPrimary = inspectedList[0];
  const inspectedTotal = inspectedList.reduce((sum, p) => sum + (p.price || 0), 0);

  const psuRatioPct =
    compatibility.selectedPsuWatts && compatibility.selectedPsuWatts > 0
      ? Math.min(100, Math.round((compatibility.estimatedSystemWatts / compatibility.selectedPsuWatts) * 100))
      : compatibility.estimatedSystemWatts > 0
      ? Math.min(100, Math.round((compatibility.estimatedSystemWatts / compatibility.recommendedPsuWatts) * 100))
      : 0;

  const psuBarTone =
    compatibility.selectedPsuWatts != null
      ? compatibility.selectedPsuWatts < compatibility.estimatedSystemWatts
        ? 'bg-rose-500'
        : compatibility.selectedPsuWatts < compatibility.recommendedPsuWatts
        ? 'bg-amber-500'
        : 'bg-emerald-500'
      : 'bg-zinc-400 dark:bg-zinc-600';

  const selectZone = (e: React.SyntheticEvent, cat: HardwareCategory) => {
    e.stopPropagation();
    onSelectCategory(cat);
  };

  return (
    <section
      aria-label="Interactive PC Chassis Blueprint"
      className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
    >
      {/* Workbench Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-carbon-elevated flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
              INTERACTIVE PC CHASSIS BLUEPRINT
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 tabular-nums">
              {installedZoneCount} / {ALL_WORKBENCH_SLOTS.length} fitted
            </span>
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">
            Hover / Click any zone to browse and fit hardware
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-0.5 shrink-0">
          <button
            type="button"
            data-testid="rig-view-assembled"
            onClick={() => onChangeViewMode('assembled')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'assembled'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Blueprint</span>
          </button>
          <button
            type="button"
            data-testid="rig-view-exploded"
            onClick={() => onChangeViewMode('exploded')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'exploded'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            <Grid className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Exploded</span>
          </button>
        </div>
      </div>

      {/* Main Drafting Surface */}
      <div className="p-3 sm:p-4 cad-grid-bg bg-zinc-50 dark:bg-[#141416] [--bp-case-fill:rgba(244,244,245,0.7)] dark:[--bp-case-fill:rgba(20,20,22,0.85)] [--bp-zone-idle-fill:rgba(255,255,255,0.75)] dark:[--bp-zone-idle-fill:rgba(24,24,27,0.65)] [--bp-idle-stroke:#a1a1aa] dark:[--bp-idle-stroke:#3f3f46] [--bp-detail-fill:#e4e4e7] dark:[--bp-detail-fill:#1c1c20] [--bp-detail-stroke:#a1a1aa] dark:[--bp-detail-stroke:#3f3f46] [--bp-fan-fill:#f4f4f5] dark:[--bp-fan-fill:#111113] [--bp-hub-fill:#d4d4d8] dark:[--bp-hub-fill:#27272a] [--bp-label:#52525b] dark:[--bp-label:#a1a1aa] [--bp-accent-label:#b45309] dark:[--bp-accent-label:#fcd34d] space-y-3.5">
        {viewMode === 'assembled' ? (
          <>
            {/* Interactive SVG Chassis Blueprint Canvas + Aligned Hotspot Pin Overlay */}
            <div className="relative w-full max-w-[470px] aspect-[520/620] mx-auto select-none">
              <svg
                viewBox="0 0 520 620"
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <filter id="amber-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  <pattern id="pcb-pattern" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path
                      d="M 16 0 L 0 0 0 16"
                      fill="none"
                      stroke="rgba(245, 158, 11, 0.06)"
                      strokeWidth="0.75"
                    />
                    <circle cx="8" cy="8" r="0.75" fill="rgba(245, 158, 11, 0.1)" />
                  </pattern>

                  <pattern id="radiator-fins" width="6" height="20" patternUnits="userSpaceOnUse">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="20"
                      stroke="rgba(161, 161, 170, 0.35)"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>

                {/* 1. OUTER CHASSIS / CASE FRAME (ZONE: Case) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'Case')}
                  onMouseEnter={() => setHoveredZone('Case')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="30"
                    y="20"
                    width="460"
                    height="580"
                    rx="16"
                    fill={getZoneFill('Case')}
                    stroke={getZoneStroke('Case')}
                    strokeWidth={isZoneActive('Case') || isZoneHovered('Case') ? 2.5 : 1.5}
                  />
                  {/* Case Feet */}
                  <rect
                    x="60"
                    y="600"
                    width="60"
                    height="12"
                    rx="3"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />
                  <rect
                    x="400"
                    y="600"
                    width="60"
                    height="12"
                    rx="3"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />
                  {/* Glass Bezel Screws */}
                  <circle cx="48" cy="38" r="4.5" fill="var(--bp-detail-fill)" stroke="var(--bp-detail-stroke)" strokeWidth="1" />
                  <circle cx="472" cy="38" r="4.5" fill="var(--bp-detail-fill)" stroke="var(--bp-detail-stroke)" strokeWidth="1" />
                  <circle cx="48" cy="465" r="4.5" fill="var(--bp-detail-fill)" stroke="var(--bp-detail-stroke)" strokeWidth="1" />
                  <circle cx="472" cy="465" r="4.5" fill="var(--bp-detail-fill)" stroke="var(--bp-detail-stroke)" strokeWidth="1" />
                  {/* Dashed PSU Shroud Divider */}
                  <line
                    x1="30"
                    y1="480"
                    x2="490"
                    y2="480"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1.75"
                    strokeDasharray="6 3"
                  />
                  <text
                    x="420"
                    y="576"
                    textAnchor="middle"
                    fill={getLabelFill('Case')}
                    className="font-mono text-[9px] font-bold pointer-events-none tracking-wider"
                  >
                    ATX CASE
                  </text>
                </g>

                {/* 2. TOP RADIATOR, REAR EXHAUST & FRONT INTAKE FANS (ZONE: Cooling) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'Cooling')}
                  onMouseEnter={() => setHoveredZone('Cooling')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  {/* Front Intake Rack */}
                  <rect
                    x="420"
                    y="60"
                    width="55"
                    height="390"
                    rx="8"
                    fill={
                      getPartCount('Cooling') >= 2
                        ? 'rgba(245, 158, 11, 0.14)'
                        : getZoneFill('Cooling')
                    }
                    stroke={
                      isZoneActive('Cooling') || isZoneHovered('Cooling')
                        ? '#f59e0b'
                        : getPartCount('Cooling') >= 2
                        ? '#d97706'
                        : 'var(--bp-idle-stroke)'
                    }
                    strokeWidth={isZoneActive('Cooling') || isZoneHovered('Cooling') ? 2 : 1.5}
                  />
                  {[115, 225, 335].map((cy) => (
                    <g key={cy}>
                      <circle
                        cx="447"
                        cy={cy}
                        r="28"
                        fill="var(--bp-fan-fill)"
                        stroke={
                          getPartCount('Cooling') >= 2 || isZoneActive('Cooling')
                            ? '#f59e0b'
                            : 'var(--bp-detail-stroke)'
                        }
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="447"
                        cy={cy}
                        r="9"
                        fill={getPartCount('Cooling') >= 2 ? '#d97706' : 'var(--bp-hub-fill)'}
                      />
                    </g>
                  ))}

                  {/* Rear Exhaust Fan */}
                  <circle
                    cx="65"
                    cy="155"
                    r="24"
                    fill="var(--bp-fan-fill)"
                    stroke={
                      getPartCount('Cooling') >= 2 || isZoneActive('Cooling')
                        ? '#f59e0b'
                        : 'var(--bp-detail-stroke)'
                    }
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="65"
                    cy="155"
                    r="8"
                    fill={getPartCount('Cooling') >= 2 ? '#d97706' : 'var(--bp-hub-fill)'}
                  />

                  {/* Top Radiator */}
                  <rect
                    x="100"
                    y="32"
                    width="300"
                    height="46"
                    rx="6"
                    fill={getZoneFill('Cooling')}
                    stroke={getZoneStroke('Cooling')}
                    strokeWidth={isZoneActive('Cooling') || isZoneHovered('Cooling') ? 2.5 : 1.5}
                  />
                  <rect x="106" y="36" width="288" height="38" fill="url(#radiator-fins)" opacity="0.6" />
                  <circle
                    cx="170"
                    cy="55"
                    r="17"
                    fill="none"
                    stroke={getZoneStroke('Cooling')}
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />
                  <circle
                    cx="330"
                    cy="55"
                    r="17"
                    fill="none"
                    stroke={getZoneStroke('Cooling')}
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />

                  {/* Braided AIO Tubes */}
                  <path
                    d="M 230 78 C 220 110, 210 130, 235 152"
                    fill="none"
                    stroke={getZoneStroke('Cooling')}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    opacity="0.75"
                  />
                  <path
                    d="M 270 78 C 280 110, 275 130, 255 152"
                    fill="none"
                    stroke={getZoneStroke('Cooling')}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    opacity="0.75"
                  />
                </g>

                {/* 3. ATX MOTHERBOARD TRAY (ZONE: Motherboard) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'Motherboard')}
                  onMouseEnter={() => setHoveredZone('Motherboard')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="95"
                    y="95"
                    width="310"
                    height="365"
                    rx="8"
                    fill={getZoneFill('Motherboard')}
                    stroke={getZoneStroke('Motherboard')}
                    strokeWidth={isZoneActive('Motherboard') || isZoneHovered('Motherboard') ? 2.5 : 1.5}
                    filter={
                      isZoneActive('Motherboard') || isZoneHovered('Motherboard')
                        ? 'url(#amber-glow)'
                        : undefined
                    }
                  />
                  <rect x="95" y="95" width="310" height="365" fill="url(#pcb-pattern)" rx="8" />
                  {/* VRM Top Heatsink */}
                  <rect
                    x="180"
                    y="105"
                    width="130"
                    height="24"
                    rx="4"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />
                  {/* Rear I/O VRM Shroud */}
                  <rect
                    x="105"
                    y="105"
                    width="45"
                    height="150"
                    rx="4"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />
                  {/* Chipset Heatsink */}
                  <rect
                    x="330"
                    y="340"
                    width="60"
                    height="60"
                    rx="6"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />
                  <path d="M 340 370 L 380 370" stroke="#f59e0b" strokeWidth="1" opacity="0.45" />
                </g>

                {/* Live PCB Signal Traces (Non-Interactive) */}
                {traces.cpuMobo.state !== 'idle' && (
                  <path
                    d="M 245 145 L 245 132"
                    fill="none"
                    stroke={getTraceStrokeColor(traces.cpuMobo.state)}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="pointer-events-none"
                  />
                )}
                {traces.ramMobo.state !== 'idle' && (
                  <path
                    d="M 342 135 L 342 126 L 310 126"
                    fill="none"
                    stroke={getTraceStrokeColor(traces.ramMobo.state)}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="pointer-events-none"
                  />
                )}

                {/* 4. PROCESSOR SOCKET (ZONE: CPU) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'CPU')}
                  onMouseEnter={() => setHoveredZone('CPU')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="195"
                    y="145"
                    width="100"
                    height="100"
                    rx="8"
                    fill={getZoneFill('CPU')}
                    stroke={getZoneStroke('CPU')}
                    strokeWidth={isZoneActive('CPU') || isZoneHovered('CPU') ? 2.5 : 1.5}
                    filter={isZoneActive('CPU') || isZoneHovered('CPU') ? 'url(#amber-glow)' : undefined}
                  />
                  <rect
                    x="207"
                    y="157"
                    width="76"
                    height="76"
                    rx="6"
                    fill={hasPart('CPU') ? 'var(--bp-detail-fill)' : 'var(--bp-fan-fill)'}
                    stroke={isZoneError('CPU') ? '#f43f5e' : hasPart('CPU') ? '#f59e0b' : 'var(--bp-detail-stroke)'}
                    strokeWidth="1.5"
                  />
                  <circle cx="215" cy="165" r="2.5" fill="#f59e0b" />
                  <path
                    d="M 230 183 L 260 183 M 245 168 L 245 198"
                    stroke="#f59e0b"
                    strokeWidth="1"
                    opacity="0.55"
                  />
                  <text
                    x="245"
                    y="224"
                    textAnchor="middle"
                    fill={getLabelFill('CPU', true)}
                    className="font-mono font-bold text-[9.5px] pointer-events-none tracking-wider"
                  >
                    {hasPart('CPU')
                      ? cpuPart?.specs?.socket
                        ? `${cpuPart.specs.socket} CPU`
                        : 'CPU FITTED'
                      : 'CPU SOCKET'}
                  </text>
                </g>

                {/* 5. MEMORY RAM SLOTS (ZONE: RAM) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'RAM')}
                  onMouseEnter={() => setHoveredZone('RAM')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="312"
                    y="135"
                    width="62"
                    height="128"
                    rx="6"
                    fill={getZoneFill('RAM')}
                    stroke={getZoneStroke('RAM')}
                    strokeWidth={isZoneActive('RAM') || isZoneHovered('RAM') ? 2.5 : 1.5}
                    filter={isZoneActive('RAM') || isZoneHovered('RAM') ? 'url(#amber-glow)' : undefined}
                  />
                  {[0, 1, 2, 3].map((slotIdx) => {
                    const xPos = 319 + slotIdx * 13;
                    const isFilled = hasPart('RAM');
                    const ramErr = isZoneError('RAM');
                    return (
                      <rect
                        key={slotIdx}
                        x={xPos}
                        y="142"
                        width="7"
                        height="102"
                        rx="2"
                        fill={
                          ramErr
                            ? '#f43f5e'
                            : isFilled
                            ? '#f59e0b'
                            : 'var(--bp-detail-fill)'
                        }
                        stroke={
                          ramErr
                            ? '#e11d48'
                            : isFilled
                            ? '#d97706'
                            : 'var(--bp-detail-stroke)'
                        }
                        strokeWidth="1"
                        opacity={isFilled ? 0.9 : 0.7}
                      />
                    );
                  })}
                  <text
                    x="343"
                    y="257"
                    textAnchor="middle"
                    fill={getLabelFill('RAM', true)}
                    className="font-mono text-[8px] font-bold pointer-events-none"
                  >
                    {ramPart?.specs?.ramType ? `${ramPart.specs.ramType} RAM` : 'DDR5 / RAM'}
                  </text>
                </g>

                {/* 6. M.2 NVMe & SATA STORAGE BAY (ZONE: Storage) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'Storage')}
                  onMouseEnter={() => setHoveredZone('Storage')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="185"
                    y="258"
                    width="120"
                    height="28"
                    rx="4"
                    fill={getZoneFill('Storage')}
                    stroke={getZoneStroke('Storage')}
                    strokeWidth={isZoneActive('Storage') || isZoneHovered('Storage') ? 2.5 : 1.5}
                  />
                  <text
                    x="194"
                    y="276"
                    textAnchor="start"
                    fill={getLabelFill('Storage')}
                    className="font-mono text-[8.5px] font-bold pointer-events-none"
                  >
                    M.2 NVMe SSD
                  </text>

                  <rect
                    x="315"
                    y="274"
                    width="82"
                    height="32"
                    rx="4"
                    fill={getZoneFill('Storage')}
                    stroke={getZoneStroke('Storage')}
                    strokeWidth={isZoneActive('Storage') || isZoneHovered('Storage') ? 2 : 1.25}
                  />
                  <text
                    x="320"
                    y="294"
                    textAnchor="start"
                    fill={getLabelFill('Storage')}
                    className="font-mono text-[8px] font-semibold pointer-events-none"
                  >
                    2.5&quot; SSD
                  </text>
                </g>

                {/* 7. GRAPHICS CARD / GPU (ZONE: GPU) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'GPU')}
                  onMouseEnter={() => setHoveredZone('GPU')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="85"
                    y="322"
                    width="315"
                    height="96"
                    rx="8"
                    fill={getZoneFill('GPU')}
                    stroke={getZoneStroke('GPU')}
                    strokeWidth={isZoneActive('GPU') || isZoneHovered('GPU') ? 2.5 : 1.5}
                    filter={isZoneActive('GPU') || isZoneHovered('GPU') ? 'url(#amber-glow)' : undefined}
                  />
                  <rect x="110" y="317" width="100" height="5" fill="#f59e0b" rx="1" />

                  {[145, 242, 340].map((cx) => (
                    <g key={cx}>
                      <circle
                        cx={cx}
                        cy="364"
                        r="27"
                        fill="var(--bp-fan-fill)"
                        stroke={getZoneStroke('GPU')}
                        strokeWidth="1.5"
                      />
                      <circle cx={cx} cy="364" r="9" fill="var(--bp-hub-fill)" />
                    </g>
                  ))}

                  <rect
                    x="358"
                    y="329"
                    width="26"
                    height="10"
                    rx="2"
                    fill="var(--bp-detail-fill)"
                    stroke="#f59e0b"
                    strokeWidth="1"
                  />

                  <text
                    x="242"
                    y="409"
                    textAnchor="middle"
                    fill={getLabelFill('GPU', true)}
                    className="font-mono text-[9.5px] font-bold pointer-events-none tracking-wider"
                  >
                    {hasPart('GPU') ? 'GPU INSTALLED' : 'PCIe 4.0 GRAPHICS CARD (GPU)'}
                  </text>
                </g>

                {/* 8. POWER SUPPLY UNIT & POWER TRACE (ZONE: PSU) */}
                <g
                  className="cursor-pointer transition-all duration-200"
                  onClick={(e) => selectZone(e, 'PSU')}
                  onMouseEnter={() => setHoveredZone('PSU')}
                  onMouseLeave={() => setHoveredZone(null)}
                >
                  <rect
                    x="50"
                    y="496"
                    width="235"
                    height="90"
                    rx="8"
                    fill={getZoneFill('PSU')}
                    stroke={getZoneStroke('PSU')}
                    strokeWidth={isZoneActive('PSU') || isZoneHovered('PSU') ? 2.5 : 1.5}
                    filter={isZoneActive('PSU') || isZoneHovered('PSU') ? 'url(#amber-glow)' : undefined}
                  />
                  <circle
                    cx="110"
                    cy="540"
                    r="28"
                    fill="var(--bp-fan-fill)"
                    stroke={getZoneStroke('PSU')}
                    strokeWidth="1.5"
                  />
                  <circle cx="110" cy="540" r="9" fill="var(--bp-hub-fill)" />

                  <rect
                    x="238"
                    y="516"
                    width="30"
                    height="14"
                    rx="2"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />
                  <rect
                    x="238"
                    y="546"
                    width="30"
                    height="14"
                    rx="2"
                    fill="var(--bp-detail-fill)"
                    stroke="var(--bp-detail-stroke)"
                    strokeWidth="1"
                  />

                  <text
                    x="167"
                    y="579"
                    textAnchor="middle"
                    fill={getLabelFill('PSU', true)}
                    className="font-mono text-[9.5px] font-bold pointer-events-none"
                  >
                    {psuPart?.specs?.wattage
                      ? `${psuPart.specs.wattage}W ATX PSU`
                      : 'ATX POWER SUPPLY (PSU)'}
                  </text>
                </g>

                {/* Curved Dashed Power Cable from PSU to Mainboard/GPU */}
                <path
                  d="M 285 540 C 345 540, 365 480, 376 420"
                  fill="none"
                  stroke={
                    traces.psuGpu.state === 'idle'
                      ? 'var(--bp-idle-stroke)'
                      : getTraceStrokeColor(traces.psuGpu.state)
                  }
                  strokeWidth="3.5"
                  strokeDasharray="4 2.5"
                  opacity={traces.psuGpu.state === 'idle' ? 0.65 : 0.9}
                  className="pointer-events-none"
                />
              </svg>

              {/* Zero-Overlap Interactive Hotspot Pin Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Primary Cooling Pin (Top Radiator) */}
                <div className="absolute left-[48.1%] top-[8.9%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-Cooling"
                    aria-pressed={isZoneActive('Cooling')}
                    onClick={(e) => selectZone(e, 'Cooling')}
                    onMouseEnter={() => setHoveredZone('Cooling')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('Cooling')}`}
                    title="CPU Cooler / AIO Radiator"
                  >
                    {hasPart('Cooling') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Secondary Cooling Pin (Front Intake Fans) */}
                <div className="absolute left-[86.0%] top-[36.3%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={(e) => selectZone(e, 'Cooling')}
                    onMouseEnter={() => setHoveredZone('Cooling')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses(
                      'Cooling',
                      getPartCount('Cooling') >= 2
                    )}`}
                    title="Case Fans / Additional Cooling"
                  >
                    {getPartCount('Cooling') >= 2 ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Motherboard Pin */}
                <div className="absolute left-[24.5%] top-[25.8%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-Motherboard"
                    aria-pressed={isZoneActive('Motherboard')}
                    onClick={(e) => selectZone(e, 'Motherboard')}
                    onMouseEnter={() => setHoveredZone('Motherboard')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('Motherboard')}`}
                    title="Motherboard"
                  >
                    {isZoneError('Motherboard') ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : hasPart('Motherboard') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* CPU Pin */}
                <div className="absolute left-[47.1%] top-[29.2%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-CPU"
                    aria-pressed={isZoneActive('CPU')}
                    onClick={(e) => selectZone(e, 'CPU')}
                    onMouseEnter={() => setHoveredZone('CPU')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('CPU')}`}
                    title="CPU Processor"
                  >
                    {isZoneError('CPU') ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : hasPart('CPU') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* RAM Pin */}
                <div className="absolute left-[66.0%] top-[30.5%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-RAM"
                    aria-pressed={isZoneActive('RAM')}
                    onClick={(e) => selectZone(e, 'RAM')}
                    onMouseEnter={() => setHoveredZone('RAM')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('RAM')}`}
                    title="Memory (RAM)"
                  >
                    {isZoneError('RAM') ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : hasPart('RAM') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Primary M.2 Storage Pin */}
                <div className="absolute left-[56.2%] top-[43.9%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-Storage"
                    aria-pressed={isZoneActive('Storage')}
                    onClick={(e) => selectZone(e, 'Storage')}
                    onMouseEnter={() => setHoveredZone('Storage')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('Storage')}`}
                    title="Primary NVMe Storage"
                  >
                    {hasPart('Storage') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Secondary 2.5" SSD Storage Pin */}
                <div className="absolute left-[75.0%] top-[46.8%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={(e) => selectZone(e, 'Storage')}
                    onMouseEnter={() => setHoveredZone('Storage')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses(
                      'Storage',
                      getPartCount('Storage') >= 2
                    )}`}
                    title="Secondary 2.5-inch SSD Bay"
                  >
                    {getPartCount('Storage') >= 2 ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* GPU Pin */}
                <div className="absolute left-[46.5%] top-[58.7%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-GPU"
                    aria-pressed={isZoneActive('GPU')}
                    onClick={(e) => selectZone(e, 'GPU')}
                    onMouseEnter={() => setHoveredZone('GPU')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('GPU')}`}
                    title="Graphics Card (GPU)"
                  >
                    {hasPart('GPU') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* PSU Pin */}
                <div className="absolute left-[35.8%] top-[86.8%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-PSU"
                    aria-pressed={isZoneActive('PSU')}
                    onClick={(e) => selectZone(e, 'PSU')}
                    onMouseEnter={() => setHoveredZone('PSU')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('PSU')}`}
                    title="Power Supply Unit (PSU)"
                  >
                    {isZoneError('PSU') ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : hasPart('PSU') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Case Chassis Pin */}
                <div className="absolute left-[80.8%] top-[87.1%] -translate-x-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    data-testid="rig-zone-Case"
                    aria-pressed={isZoneActive('Case')}
                    onClick={(e) => selectZone(e, 'Case')}
                    onMouseEnter={() => setHoveredZone('Case')}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`pointer-events-auto w-6 h-6 sm:w-7 sm:h-7 rounded-full border shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${getPinClasses('Case')}`}
                    title="PC Case / Chassis"
                  >
                    {hasPart('Case') ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Floating Active / Hovered Zone Inspector HUD */}
            <div className="rounded-xl bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {inspectedPrimary ? (
                    <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-100">
                      <ProductImage
                        imageUrl={inspectedPrimary.imageUrl}
                        sku={inspectedPrimary.sku}
                        name={inspectedPrimary.name}
                        category={inspectedZone}
                        className="w-full h-full object-contain p-0.5"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 shrink-0 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-carbon-elevated flex items-center justify-center text-amber-600 dark:text-amber-400">
                      {getCategoryIcon(inspectedZone, 'w-5 h-5')}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                        {inspectedZone}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-900/60">
                        {inspectedList.length > 1
                          ? `${inspectedList.length} Fitted`
                          : hoveredZone
                          ? 'Previewing Zone'
                          : 'Active Slot'}
                      </span>
                    </div>

                    {inspectedPrimary ? (
                      <>
                        <div className="text-xs text-zinc-700 dark:text-zinc-300 font-medium truncate">
                          {inspectedList.length > 1
                            ? inspectedList.map((p) => p.name).join(' + ')
                            : inspectedPrimary.name}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {formatSpecSummary(inspectedPrimary).map((spec) => (
                            <span
                              key={spec}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        No component fitted for this slot yet
                      </div>
                    )}
                  </div>
                </div>

                {inspectedPrimary ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-semibold text-sm text-amber-700 dark:text-amber-400 tabular-nums">
                      {formatCurrency(inspectedTotal, currencySymbol)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemovePart(inspectedZone)}
                      aria-label={`Clear ${inspectedZone}`}
                      title={`Clear ${inspectedZone}`}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectCategory(inspectedZone)}
                    className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs shrink-0 cursor-pointer transition-colors"
                  >
                    Browse {inspectedZone}
                  </button>
                )}
              </div>

              {(compatibility.estimatedSystemWatts > 0 || psuPart?.specs?.wattage) && (
                <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 dark:text-zinc-400">
                    <span>
                      System Draw:{' '}
                      <strong className="text-zinc-900 dark:text-zinc-100">
                        {compatibility.estimatedSystemWatts}W
                      </strong>
                    </span>
                    <span>
                      {psuPart?.specs?.wattage
                        ? `Unit: ${psuPart.specs.wattage}W (${psuRatioPct}% load)`
                        : `Target: ${compatibility.recommendedPsuWatts}W+`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${psuBarTone}`}
                      style={{ width: `${Math.max(4, psuRatioPct)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Adjacent Desk Peripherals Deck & Live Signal Bus */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Desk &amp; Output Deck
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                    Optional
                  </span>
                </div>
                {DESK_SLOTS.map((slot) => {
                  const parts = getPartList(slot);
                  const primary = parts[0];
                  const active = isZoneActive(slot);
                  return (
                    <div
                      key={slot}
                      className={`rounded-lg border p-2 flex items-center gap-2 transition-colors ${
                        active
                          ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-carbon-elevated hover:border-amber-400'
                      }`}
                    >
                      <button
                        type="button"
                        data-testid={`rig-zone-${slot}`}
                        aria-pressed={active}
                        onClick={() => onSelectCategory(slot)}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer focus:outline-none"
                      >
                        {primary ? (
                          <div className="w-9 h-9 shrink-0 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-100 overflow-hidden">
                            <ProductImage
                              imageUrl={primary.imageUrl}
                              sku={primary.sku}
                              name={primary.name}
                              category={slot}
                              className="w-full h-full object-contain p-0.5"
                            />
                          </div>
                        ) : (
                          <div className="w-9 h-9 shrink-0 rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-carbon flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                            {getCategoryIcon(slot, 'w-4 h-4')}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                            <span>{slot}</span>
                            {parts.length > 1 && (
                              <span className="px-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                +{parts.length - 1}
                              </span>
                            )}
                          </div>
                          {primary ? (
                            <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                              {primary.name}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {slot === 'Monitor' ? '+ Add display panel' : '+ Add mouse, keyboard'}
                            </div>
                          )}
                        </div>
                      </button>

                      {primary && (
                        <button
                          type="button"
                          onClick={() => onRemovePart(slot)}
                          aria-label={`Remove ${slot}`}
                          className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Live Bus & Rail Trace Diagnostics */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Bus &amp; Power Traces
                  </span>
                  {compatibility.isCompatible && compatibility.warnings.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      All Clear
                    </span>
                  ) : !compatibility.isCompatible ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-rose-600 dark:text-rose-400">
                      <XCircle className="w-3 h-3" />
                      Conflict
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      Advisory
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { key: 'cpuMobo', title: 'CPU <-> Mobo', trace: traces.cpuMobo },
                    { key: 'ramMobo', title: 'RAM <-> Mobo', trace: traces.ramMobo },
                    { key: 'psuCpu', title: 'PSU -> CPU Rail', trace: traces.psuCpu },
                    { key: 'psuGpu', title: 'PSU -> GPU Rail', trace: traces.psuGpu },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-md border px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] ${getTracePillClasses(
                        item.trace.state
                      )}`}
                    >
                      <span className="font-mono font-semibold shrink-0">{item.title}</span>
                      <span className="truncate font-medium text-right">{item.trace.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Exploded Teardown Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ALL_WORKBENCH_SLOTS.map((slot) => {
              const parts = getPartList(slot);
              const active = isZoneActive(slot);
              const isMulti = MULTI_SLOT_CATEGORIES.has(slot);
              const meta = SLOT_ORDER_LABELS[slot];

              return (
                <div
                  key={slot}
                  className={`rounded-xl border p-3 transition-all flex flex-col justify-between gap-2.5 ${
                    active
                      ? 'border-amber-500 ring-2 ring-amber-500/20 bg-white dark:bg-carbon'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon hover:border-amber-400 dark:hover:border-amber-600'
                  }`}
                >
                  <button
                    type="button"
                    data-testid={`rig-zone-${slot}`}
                    onClick={() => onSelectCategory(slot)}
                    aria-pressed={active}
                    className="text-left flex items-start gap-3 cursor-pointer group w-full focus:outline-none"
                  >
                    <div className="w-16 h-16 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-100 flex items-center justify-center overflow-hidden">
                      {parts[0] ? (
                        <ProductImage
                          imageUrl={parts[0].imageUrl}
                          sku={parts[0].sku}
                          name={parts[0].name}
                          category={slot}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-50 dark:bg-carbon-elevated flex items-center justify-center text-zinc-400 dark:text-zinc-500 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          {getCategoryIcon(slot, 'w-6 h-6')}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          {meta.code} {meta.label}
                        </span>
                        {active && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-semibold">
                            Active
                          </span>
                        )}
                      </div>

                      {parts[0] ? (
                        <div className="mt-1">
                          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 line-clamp-2 leading-snug">
                            {parts[0].name}
                          </div>
                          <div className="mt-1 text-xs font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                            {formatCurrency(
                              parts.reduce((s, p) => s + (p.price ?? 0), 0),
                              currencySymbol
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1">
                          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-amber-700 dark:group-hover:text-amber-400">
                            + Assign {slot}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {meta.hint}
                          </div>
                        </div>
                      )}
                    </div>
                  </button>

                  {parts.length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                      {parts.map((part) => (
                        <div
                          key={part.id}
                          className="flex items-center justify-between gap-2 text-xs bg-zinc-50 dark:bg-carbon-elevated rounded-md px-2 py-1 border border-zinc-200/70 dark:border-zinc-800"
                        >
                          <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">
                            {part.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemovePart(slot, isMulti ? part.id : undefined)}
                            aria-label={`Remove ${part.name}`}
                            className="p-0.5 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
