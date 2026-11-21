import { useState } from 'react';
import { HardwareCategory, formatCurrency } from '@countwise/shared';
import { ProductLocal } from '../db/index.js';
import {
  Cpu,
  Layers,
  Sparkles,
  Zap,
  HardDrive,
  Box,
  Fan,
  Server,
  CheckCircle2,
  Plus,
  X,
  Monitor,
  MousePointer,
} from 'lucide-react';

interface PcRigSilhouetteProps {
  selectedParts: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>>;
  activeCategory: HardwareCategory;
  onSelectCategory: (category: HardwareCategory) => void;
  onRemovePart: (category: HardwareCategory, productId?: string) => void;
  currencySymbol?: string;
  className?: string;
}

export function PcRigSilhouette({
  selectedParts,
  activeCategory,
  onSelectCategory,
  onRemovePart,
  currencySymbol = '₱',
  className = '',
}: PcRigSilhouetteProps) {
  const [hoveredZone, setHoveredZone] = useState<HardwareCategory | null>(null);

  const getPartList = (cat: HardwareCategory): ProductLocal[] => {
    const val = selectedParts[cat];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  // Helper to determine if a zone is active or hovered
  const isZoneActive = (cat: HardwareCategory) => activeCategory === cat;
  const isZoneHovered = (cat: HardwareCategory) => hoveredZone === cat;
  const hasPart = (cat: HardwareCategory) => getPartList(cat).length > 0;
  const getPartCount = (cat: HardwareCategory) => getPartList(cat).length;

  // Color classes for zone outlines and fills
  const getZoneStroke = (cat: HardwareCategory) => {
    if (isZoneActive(cat)) return '#f59e0b'; // Amber-500
    if (isZoneHovered(cat)) return '#fbbf24'; // Amber-400
    if (hasPart(cat)) return '#d97706'; // Amber-600
    return '#44403c'; // Stone-700
  };

  const getZoneFill = (cat: HardwareCategory) => {
    if (isZoneActive(cat)) return 'rgba(245, 158, 11, 0.15)';
    if (isZoneHovered(cat)) return 'rgba(251, 191, 36, 0.10)';
    if (hasPart(cat)) return 'rgba(217, 119, 6, 0.08)';
    return 'rgba(28, 25, 23, 0.6)';
  };

  const currentHoveredOrActive = hoveredZone || activeCategory;
  const selectedListForActive = getPartList(currentHoveredOrActive);
  const selectedForActive = selectedListForActive[0];
  const selectedTotalForActive = selectedListForActive.reduce((s, p) => s + (p.price || 0), 0);

  return (
    <div className={`flex flex-col bg-stone-900/80 border border-stone-800 rounded-2xl p-4 relative ${className}`}>
      {/* Top Silhouette HUD Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-stone-800/80 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-bold text-white uppercase tracking-wider">
            Interactive PC Chassis Blueprint
          </span>
        </div>
        <div className="text-[11px] text-stone-400">
          Hover / Click any zone to browse and fit hardware
        </div>
      </div>

      {/* Main SVG Vector Canvas */}
      <div className="relative w-full aspect-[4/5] sm:aspect-[5/6] max-h-[520px] mx-auto select-none">
        <svg
          viewBox="0 0 520 620"
          className="w-full h-full drop-shadow-2xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Ambient Gold Glow Filter */}
            <filter id="gold-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Motherboard Grid Pattern */}
            <pattern id="pcb-pattern" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(245, 158, 11, 0.05)" strokeWidth="0.75" />
              <circle cx="8" cy="8" r="0.75" fill="rgba(245, 158, 11, 0.08)" />
            </pattern>

            {/* Radiator Fin Pattern */}
            <pattern id="radiator-fins" width="6" height="20" patternUnits="userSpaceOnUse">
              <line x1="1" y1="0" x2="1" y2="20" stroke="rgba(120, 113, 108, 0.3)" strokeWidth="1" />
            </pattern>
          </defs>

          {/* ======================================================== */}
          {/* 1. OUTER CHASSIS / CASE FRAME (ZONE: Case)             */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('Case')}
            onMouseEnter={() => setHoveredZone('Case')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* Outer Tower Outline */}
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
            <rect x="60" y="600" width="60" height="12" rx="3" fill="#1c1917" stroke="#44403c" strokeWidth="1" />
            <rect x="400" y="600" width="60" height="12" rx="3" fill="#1c1917" stroke="#44403c" strokeWidth="1" />

            {/* Tempered Glass Bezel Screws */}
            <circle cx="48" cy="38" r="4.5" fill="#292524" stroke="#78716c" strokeWidth="1" />
            <circle cx="472" cy="38" r="4.5" fill="#292524" stroke="#78716c" strokeWidth="1" />
            <circle cx="48" cy="465" r="4.5" fill="#292524" stroke="#78716c" strokeWidth="1" />
            <circle cx="472" cy="465" r="4.5" fill="#292524" stroke="#78716c" strokeWidth="1" />
          </g>

          {/* ======================================================== */}
          {/* 2. TOP RADIATOR, FRONT INTAKE & REAR EXHAUST (Cooling)   */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('Cooling')}
            onMouseEnter={() => setHoveredZone('Cooling')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* Front Panel Mesh & 3x Case Intake Fans (Secondary Cooling Slot) */}
            <rect
              x="420"
              y="60"
              width="55"
              height="390"
              rx="8"
              fill={getPartCount('Cooling') >= 2 ? 'rgba(245, 158, 11, 0.14)' : getZoneFill('Cooling')}
              stroke={
                isZoneActive('Cooling') || isZoneHovered('Cooling')
                  ? '#f59e0b'
                  : getPartCount('Cooling') >= 2
                  ? '#d97706'
                  : '#292524'
              }
              strokeWidth={isZoneActive('Cooling') || isZoneHovered('Cooling') ? 2 : 1.5}
            />
            {/* Intake Fan 1 */}
            <circle
              cx="447"
              cy="115"
              r="30"
              fill="#1c1917"
              stroke={getPartCount('Cooling') >= 2 || isZoneActive('Cooling') ? '#f59e0b' : '#44403c'}
              strokeWidth="1.5"
            />
            <circle cx="447" cy="115" r="10" fill={getPartCount('Cooling') >= 2 ? '#d97706' : '#292524'} />
            {/* Intake Fan 2 */}
            <circle
              cx="447"
              cy="225"
              r="30"
              fill="#1c1917"
              stroke={getPartCount('Cooling') >= 2 || isZoneActive('Cooling') ? '#f59e0b' : '#44403c'}
              strokeWidth="1.5"
            />
            <circle cx="447" cy="225" r="10" fill={getPartCount('Cooling') >= 2 ? '#d97706' : '#292524'} />
            {/* Intake Fan 3 */}
            <circle
              cx="447"
              cy="335"
              r="30"
              fill="#1c1917"
              stroke={getPartCount('Cooling') >= 2 || isZoneActive('Cooling') ? '#f59e0b' : '#44403c'}
              strokeWidth="1.5"
            />
            <circle cx="447" cy="335" r="10" fill={getPartCount('Cooling') >= 2 ? '#d97706' : '#292524'} />

            {/* Rear Exhaust Fan (120mm) */}
            <circle
              cx="65"
              cy="155"
              r="24"
              fill="#141210"
              stroke={getPartCount('Cooling') >= 2 || isZoneActive('Cooling') ? '#f59e0b' : '#292524'}
              strokeWidth="1.5"
            />
            <circle cx="65" cy="155" r="8" fill={getPartCount('Cooling') >= 2 ? '#d97706' : '#292524'} />

            {/* Radiator Chamber */}
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

            {/* Dual Radiator Fans */}
            <circle cx="170" cy="55" r="17" fill="none" stroke={getZoneStroke('Cooling')} strokeWidth="1" strokeDasharray="4 2" />
            <circle cx="330" cy="55" r="17" fill="none" stroke={getZoneStroke('Cooling')} strokeWidth="1" strokeDasharray="4 2" />

            {/* Braided Liquid Cooling Tubes arching down to CPU */}
            <path
              d="M 230 78 C 220 110, 210 130, 235 170"
              fill="none"
              stroke={getZoneStroke('Cooling')}
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M 270 78 C 280 110, 275 130, 255 170"
              fill="none"
              stroke={getZoneStroke('Cooling')}
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.8"
            />
          </g>

          {/* ======================================================== */}
          {/* 3. ATX MOTHERBOARD TRAY (ZONE: Motherboard)             */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('Motherboard')}
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
            />
            <rect x="95" y="95" width="310" height="365" fill="url(#pcb-pattern)" rx="8" />

            {/* VRM Top Heatsink */}
            <rect x="180" y="105" width="130" height="24" rx="4" fill="#292524" stroke="#44403c" strokeWidth="1" />
            {/* VRM Left Heatsink / Rear I/O Shield */}
            <rect x="105" y="105" width="45" height="150" rx="4" fill="#292524" stroke="#44403c" strokeWidth="1" />

            {/* Motherboard chipset heatsink bottom right */}
            <rect x="330" y="340" width="60" height="60" rx="6" fill="#292524" stroke="#44403c" strokeWidth="1" />
            <path d="M 340 370 L 380 370" stroke="#f59e0b" strokeWidth="1" opacity="0.4" />
          </g>

          {/* ======================================================== */}
          {/* 4. PROCESSOR SOCKET & CHIP (ZONE: CPU)                   */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('CPU')}
            onMouseEnter={() => setHoveredZone('CPU')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* Outer Socket Retention Bracket */}
            <rect
              x="195"
              y="145"
              width="100"
              height="100"
              rx="8"
              fill={getZoneFill('CPU')}
              stroke={getZoneStroke('CPU')}
              strokeWidth={isZoneActive('CPU') || isZoneHovered('CPU') ? 2.5 : 1.5}
              filter={isZoneActive('CPU') || isZoneHovered('CPU') ? 'url(#gold-glow)' : undefined}
            />

            {/* CPU Metallic Heat Spreader (IHS) */}
            <rect
              x="207"
              y="157"
              width="76"
              height="76"
              rx="6"
              fill={hasPart('CPU') ? '#292524' : '#1c1917'}
              stroke={hasPart('CPU') ? '#f59e0b' : '#57534e'}
              strokeWidth="1.5"
            />

            {/* Micro Gold Trace Geometry */}
            <circle cx="215" cy="165" r="2.5" fill="#f59e0b" />
            <path d="M 230 185 L 260 185 M 245 170 L 245 200" stroke="#f59e0b" strokeWidth="1" opacity="0.6" />

            {/* CPU Socket Label / Icon */}
            <text
              x="245"
              y="200"
              textAnchor="middle"
              className="font-mono font-bold text-[10px] fill-amber-300 pointer-events-none tracking-wider"
            >
              {hasPart('CPU') ? 'CPU INSTALLED' : 'CPU SOCKET'}
            </text>
          </g>

          {/* ======================================================== */}
          {/* 5. MEMORY RAM SLOTS (ZONE: RAM)                          */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('RAM')}
            onMouseEnter={() => setHoveredZone('RAM')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* RAM Module Zone Envelope */}
            <rect
              x="312"
              y="135"
              width="60"
              height="125"
              rx="6"
              fill={getZoneFill('RAM')}
              stroke={getZoneStroke('RAM')}
              strokeWidth={isZoneActive('RAM') || isZoneHovered('RAM') ? 2.5 : 1.5}
              filter={isZoneActive('RAM') || isZoneHovered('RAM') ? 'url(#gold-glow)' : undefined}
            />

            {/* 4 DDR5/DDR4 DIMM Slots */}
            {[0, 1, 2, 3].map((slotIdx) => {
              const xPos = 318 + slotIdx * 13;
              const isFilled = hasPart('RAM');
              return (
                <rect
                  key={slotIdx}
                  x={xPos}
                  y="142"
                  width="7"
                  height="110"
                  rx="2"
                  fill={isFilled ? '#f59e0b' : '#292524'}
                  stroke={isFilled ? '#d97706' : '#44403c'}
                  strokeWidth="1"
                  opacity={isFilled ? 0.9 : 0.6}
                />
              );
            })}

            <text
              x="342"
              y="254"
              textAnchor="middle"
              className="font-mono text-[8px] font-bold fill-amber-300 pointer-events-none"
            >
              DDR5 / RAM
            </text>
          </g>

          {/* ======================================================== */}
          {/* 6. M.2 NVMe & STORAGE BAY (ZONE: Storage)               */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('Storage')}
            onMouseEnter={() => setHoveredZone('Storage')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* M.2 Thermal Heatsink Bar directly above GPU */}
            <rect
              x="195"
              y="255"
              width="100"
              height="22"
              rx="4"
              fill={getZoneFill('Storage')}
              stroke={getZoneStroke('Storage')}
              strokeWidth={isZoneActive('Storage') || isZoneHovered('Storage') ? 2.5 : 1.5}
            />
            <text
              x="245"
              y="270"
              textAnchor="middle"
              className="font-mono text-[9px] font-bold fill-stone-300 pointer-events-none"
            >
              PCIe M.2 NVMe SSD
            </text>

            {/* Secondary 2.5" SSD Tray on case right side */}
            <rect
              x="320"
              y="270"
              width="70"
              height="35"
              rx="4"
              fill={getZoneFill('Storage')}
              stroke={getZoneStroke('Storage')}
              strokeWidth="1"
            />
            <text
              x="355"
              y="292"
              textAnchor="middle"
              className="font-mono text-[8px] fill-stone-400 pointer-events-none"
            >
              2.5" SSD BAY
            </text>
          </g>

          {/* ======================================================== */}
          {/* 7. GRAPHICS CARD / GPU (ZONE: GPU)                       */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('GPU')}
            onMouseEnter={() => setHoveredZone('GPU')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* GPU Outer Shroud Container */}
            <rect
              x="85"
              y="315"
              width="315"
              height="95"
              rx="8"
              fill={getZoneFill('GPU')}
              stroke={getZoneStroke('GPU')}
              strokeWidth={isZoneActive('GPU') || isZoneHovered('GPU') ? 2.5 : 1.5}
              filter={isZoneActive('GPU') || isZoneHovered('GPU') ? 'url(#gold-glow)' : undefined}
            />

            {/* PCIe Top Gold Connector Fingers */}
            <rect x="110" y="310" width="100" height="5" fill="#f59e0b" rx="1" />

            {/* Triple Axial GPU Fans */}
            <circle cx="145" cy="362" r="28" fill="#141210" stroke={getZoneStroke('GPU')} strokeWidth="1.5" />
            <circle cx="145" cy="362" r="9" fill="#292524" />

            <circle cx="242" cy="362" r="28" fill="#141210" stroke={getZoneStroke('GPU')} strokeWidth="1.5" />
            <circle cx="242" cy="362" r="9" fill="#292524" />

            <circle cx="340" cy="362" r="28" fill="#141210" stroke={getZoneStroke('GPU')} strokeWidth="1.5" />
            <circle cx="340" cy="362" r="9" fill="#292524" />

            {/* GPU Power 12VHPWR Header */}
            <rect x="360" y="322" width="24" height="10" rx="2" fill="#292524" stroke="#f59e0b" strokeWidth="1" />

            <text
              x="242"
              y="402"
              textAnchor="middle"
              className="font-mono text-[10px] font-bold fill-amber-300 pointer-events-none tracking-wider"
            >
              {hasPart('GPU') ? 'RTX / RADEON GPU READY' : 'PCIe 4.0 GRAPHICS CARD (GPU)'}
            </text>
          </g>

          {/* ======================================================== */}
          {/* 8. POWER SUPPLY UNIT & BASEMENT (ZONE: PSU)              */}
          {/* ======================================================== */}
          <g
            className="cursor-pointer transition-all duration-200"
            onClick={() => onSelectCategory('PSU')}
            onMouseEnter={() => setHoveredZone('PSU')}
            onMouseLeave={() => setHoveredZone(null)}
          >
            {/* PSU Basement Shroud Divider */}
            <line x1="30" y1="480" x2="490" y2="480" stroke="#44403c" strokeWidth="2" strokeDasharray="6 3" />

            {/* Modular PSU Unit Box */}
            <rect
              x="50"
              y="495"
              width="230"
              height="90"
              rx="8"
              fill={getZoneFill('PSU')}
              stroke={getZoneStroke('PSU')}
              strokeWidth={isZoneActive('PSU') || isZoneHovered('PSU') ? 2.5 : 1.5}
            />

            {/* PSU Exhaust Fan Grill */}
            <circle cx="110" cy="540" r="30" fill="#141210" stroke={getZoneStroke('PSU')} strokeWidth="1.5" />
            <circle cx="110" cy="540" r="10" fill="#292524" />

            {/* Modular Power Cable Ports */}
            <rect x="235" y="515" width="30" height="15" rx="2" fill="#292524" stroke="#57534e" strokeWidth="1" />
            <rect x="235" y="545" width="30" height="15" rx="2" fill="#292524" stroke="#57534e" strokeWidth="1" />

            <text
              x="165"
              y="578"
              textAnchor="middle"
              className="font-mono text-[10px] font-bold fill-amber-300 pointer-events-none"
            >
              ATX POWER SUPPLY (PSU)
            </text>

            {/* Cable Management Run to Motherboard */}
            <path
              d="M 280 540 C 340 540, 360 480, 380 430"
              fill="none"
              stroke="#44403c"
              strokeWidth="4"
              strokeDasharray="4 2"
              opacity="0.6"
            />
          </g>
        </svg>

        {/* Dynamic Interactive Hotspot Pins Overlaid on Silhouette */}
        <div className="absolute inset-0 pointer-events-none">
          {/* CPU Pin */}
          <div className="absolute top-[28%] left-[47%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('CPU')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('CPU')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="CPU Processor"
            >
              {hasPart('CPU') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* GPU Pin */}
          <div className="absolute top-[58%] left-[47%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('GPU')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('GPU')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Graphics Card (GPU)"
            >
              {hasPart('GPU') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* RAM Pin */}
          <div className="absolute top-[31%] left-[68%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('RAM')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('RAM')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Memory (RAM)"
            >
              {hasPart('RAM') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Motherboard Pin */}
          <div className="absolute top-[22%] left-[23%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('Motherboard')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('Motherboard')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Motherboard"
            >
              {hasPart('Motherboard') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Top CPU / AIO Cooling Pin */}
          <div className="absolute top-[8%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('Cooling')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('Cooling')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="CPU Cooler / AIO Radiator"
            >
              {hasPart('Cooling') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Front Case Fans Pin (2nd Cooling Component) */}
          <div className="absolute top-[36%] left-[86%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('Cooling')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                getPartCount('Cooling') >= 2
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Case Fans / Additional Cooling"
            >
              {getPartCount('Cooling') >= 2 ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Storage Pin */}
          <div className="absolute top-[43%] left-[47%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('Storage')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('Storage')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Primary NVMe Storage"
            >
              {hasPart('Storage') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Secondary 2.5" / SATA Storage Pin */}
          <div className="absolute top-[46.5%] left-[68%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('Storage')}
              className={`pointer-events-auto p-1 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                getPartCount('Storage') >= 2
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Secondary SSD / HDD Bay"
            >
              {getPartCount('Storage') >= 2 ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* PSU Pin */}
          <div className="absolute top-[88%] left-[34%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory('PSU')}
              className={`pointer-events-auto p-1.5 rounded-full border shadow-lg transition-transform hover:scale-110 cursor-pointer ${
                hasPart('PSU')
                  ? 'bg-amber-500 text-stone-950 border-amber-300 ring-2 ring-amber-500/30'
                  : 'bg-stone-950/90 text-stone-300 border-stone-700 hover:border-amber-400'
              }`}
              title="Power Supply Unit (PSU)"
            >
              {hasPart('PSU') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Status / Inspector Bar for Current Zone */}
      <div className="mt-3 p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-3.5 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800 text-amber-400 shrink-0">
            {currentHoveredOrActive === 'CPU' && <Cpu className="w-4 h-4" />}
            {currentHoveredOrActive === 'GPU' && <Sparkles className="w-4 h-4" />}
            {currentHoveredOrActive === 'Motherboard' && <Server className="w-4 h-4" />}
            {currentHoveredOrActive === 'RAM' && <Layers className="w-4 h-4" />}
            {currentHoveredOrActive === 'Storage' && <HardDrive className="w-4 h-4" />}
            {currentHoveredOrActive === 'PSU' && <Zap className="w-4 h-4" />}
            {currentHoveredOrActive === 'Cooling' && <Fan className="w-4 h-4" />}
            {currentHoveredOrActive === 'Case' && <Box className="w-4 h-4" />}
            {currentHoveredOrActive === 'Monitor' && <Monitor className="w-4 h-4" />}
            {currentHoveredOrActive === 'Peripheral' && <MousePointer className="w-4 h-4" />}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="font-bold text-white text-sm flex items-center gap-2 truncate">
              <span>{currentHoveredOrActive}</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/40">
                {selectedListForActive.length > 1
                  ? `${selectedListForActive.length} Installed`
                  : 'Active Slot'}
              </span>
            </div>
            <div className="text-xs text-stone-400 leading-snug line-clamp-2">
              {selectedListForActive.length > 1
                ? selectedListForActive.map((p) => p.name).join(' + ')
                : selectedForActive
                ? selectedForActive.name
                : 'No component selected for this slot yet'}
            </div>
          </div>
        </div>

        {selectedForActive ? (
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="font-mono font-bold text-sm text-amber-400">
              {formatCurrency(selectedTotalForActive, currencySymbol)}
            </span>
            <button
              type="button"
              onClick={() => onRemovePart(currentHoveredOrActive)}
              className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
              title="Clear slot"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSelectCategory(currentHoveredOrActive)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shrink-0 cursor-pointer"
          >
            Browse Parts
          </button>
        )}
      </div>

      {/* Quick Category Selector Pills (includes Monitor & Peripherals) */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {(['CPU', 'Motherboard', 'RAM', 'GPU', 'Storage', 'PSU', 'Cooling', 'Case', 'Monitor', 'Peripheral'] as HardwareCategory[]).map(
          (cat) => {
            const count = getPartCount(cat);
            const hasIt = count > 0;
            const isCurrent = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                onMouseEnter={() => setHoveredZone(cat)}
                onMouseLeave={() => setHoveredZone(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isCurrent
                    ? 'bg-amber-500 text-stone-950 font-bold shadow'
                    : hasIt
                    ? 'bg-stone-950 text-amber-300 border border-amber-800/60'
                    : 'bg-stone-950 text-stone-300 hover:text-white border border-stone-800'
                }`}
              >
                {hasIt && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                <span>{count > 1 ? `${cat} (${count})` : cat}</span>
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}
