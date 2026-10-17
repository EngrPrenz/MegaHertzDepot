import React from 'react';

interface MegaHertzLogoProps {
  variant?: 'icon' | 'horizontal' | 'stacked';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSubtitle?: boolean;
}

export const MegaHertzLogo: React.FC<MegaHertzLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  className = '',
  showSubtitle = true,
}) => {
  // Dimensions for icon emblem
  const iconSizes = {
    sm: { box: 28, text: 'text-xs', sub: 'text-[9px]' },
    md: { box: 36, text: 'text-sm', sub: 'text-[10px]' },
    lg: { box: 48, text: 'text-base', sub: 'text-xs' },
    xl: { box: 64, text: 'text-xl', sub: 'text-sm' },
  };

  const currentSize = iconSizes[size];

  // SVG Mark: Sleek "M" geometry with integrated frequency pulse and circuit trace lines
  const Emblem = (
    <svg
      width={currentSize.box}
      height={currentSize.box}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform hover:scale-105 duration-200"
      aria-label="MegaHertz Depot Emblem"
    >
      <defs>
        {/* Studio Bronze to Warm Gold gradient */}
        <linearGradient id="mhd-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>

        {/* Pulse glow gradient */}
        <linearGradient id="mhd-grad-pulse" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>

        {/* Background badge gradient */}
        <linearGradient id="mhd-grad-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1c1917" />
          <stop offset="100%" stopColor="#0c0a09" />
        </linearGradient>
      </defs>

      {/* Outer rounded container with subtle border */}
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill="url(#mhd-grad-bg)"
        stroke="rgba(245, 158, 11, 0.3)"
        strokeWidth="2"
      />

      {/* Subtle background tech grid */}
      <path
        d="M20 20 H80 M20 35 H80 M20 50 H80 M20 65 H80 M20 80 H80 M35 20 V80 M50 20 V80 M65 20 V80"
        stroke="rgba(255, 255, 255, 0.03)"
        strokeWidth="1"
      />

      {/* Silicon Die Circuit Traces in Warm Bronze & Amber */}
      <g stroke="rgba(245, 158, 11, 0.45)" strokeWidth="1.5" strokeLinecap="round" opacity="0.85">
        <path d="M26 28 L34 36 V48" />
        <circle cx="26" cy="28" r="2" fill="#f59e0b" />
        <path d="M74 28 L66 36 V48" />
        <circle cx="74" cy="28" r="2" fill="#d97706" />
        <path d="M26 72 L34 64 V56" />
        <circle cx="26" cy="72" r="2" fill="#f59e0b" />
        <path d="M74 72 L66 64 V56" />
        <circle cx="74" cy="72" r="2" fill="#d97706" />
      </g>

      {/* Bold Monogram "M" Frame */}
      <path
        d="M22 75 V28 L42 54 L50 44 L58 54 L78 28 V75"
        stroke="url(#mhd-grad-primary)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dynamic Hertz / Frequency Pulse Wave Cutting Across Center */}
      <path
        d="M10 50 H32 L40 32 L50 68 L58 32 L66 50 H90"
        stroke="url(#mhd-grad-pulse)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center frequency peak node */}
      <circle cx="50" cy="50" r="2" fill="#fafaf9" />
    </svg>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{Emblem}</div>;
  }

  if (variant === 'stacked') {
    return (
      <div className={`inline-flex flex-col items-center text-center gap-2.5 ${className}`}>
        {Emblem}
        <div>
          <div className={`font-black tracking-wider uppercase text-white ${currentSize.text} flex items-center justify-center gap-1.5`}>
            <span>MegaHertz</span>
            <span className="text-amber-400">
              Depot
            </span>
          </div>
          {showSubtitle && (
            <div className={`font-mono tracking-widest text-stone-400 uppercase ${currentSize.sub}`}>
              Offline PC Hardware & POS
            </div>
          )}
        </div>
      </div>
    );
  }

  // Horizontal variant (default)
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {Emblem}
      <div className="flex flex-col">
        <div className={`font-black tracking-tight text-white ${currentSize.text} flex items-center gap-1.5 leading-none`}>
          <span>MegaHertz</span>
          <span className="text-amber-400">
            Depot
          </span>
        </div>
        {showSubtitle && (
          <div className={`font-mono text-stone-400 mt-1 uppercase tracking-wide leading-none ${currentSize.sub}`}>
            PC Hardware POS & Rig Builder
          </div>
        )}
      </div>
    </div>
  );
};
