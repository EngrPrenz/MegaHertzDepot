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
  showSubtitle = false,
}) => {
  const iconSizes = {
    sm: { box: 28, text: 'text-sm', sub: 'text-[11px]' },
    md: { box: 30, text: 'text-sm sm:text-base', sub: 'text-xs' },
    lg: { box: 40, text: 'text-lg', sub: 'text-xs' },
    xl: { box: 48, text: 'text-xl', sub: 'text-sm' },
  };

  const currentSize = iconSizes[size];

  const Emblem = (
    <svg
      width={currentSize.box}
      height={currentSize.box}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-label="MegaHertz Depot"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="12"
        fill="#111113"
        className="stroke-transparent dark:stroke-zinc-700"
        strokeWidth="2"
      />
      <path
        d="M15 47V17L32 36L49 17V47"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 33H21L26 23L32 42L38 23L43 33H54"
        stroke="#f59e0b"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{Emblem}</div>;
  }

  if (variant === 'stacked') {
    return (
      <div className={`inline-flex flex-col items-center text-center gap-2 ${className}`}>
        {Emblem}
        <div>
          <div className={`font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 ${currentSize.text} flex items-center justify-center gap-1`}>
            <span>MegaHertz</span>
            <span className="text-amber-700 dark:text-amber-400">Depot</span>
          </div>
          {showSubtitle && (
            <div className={`text-zinc-600 dark:text-zinc-400 mt-0.5 ${currentSize.sub}`}>
              PC Hardware Store &amp; POS
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      {Emblem}
      <div className="flex flex-col">
        <div className={`font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 ${currentSize.text} flex items-center gap-1 leading-none`}>
          <span>MegaHertz</span>
          <span className="text-amber-700 dark:text-amber-400">Depot</span>
        </div>
        {showSubtitle && (
          <div className={`text-zinc-600 dark:text-zinc-400 mt-1 leading-none ${currentSize.sub}`}>
            PC Hardware &amp; POS
          </div>
        )}
      </div>
    </div>
  );
};
