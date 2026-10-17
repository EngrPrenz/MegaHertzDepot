import React, { useState } from 'react';
import { HardwareCategory } from '@countwise/shared';
import {
  Cpu,
  Layers,
  HardDrive,
  Monitor,
  Box,
  Fan,
  Zap,
  MousePointer,
  Server,
  Sparkles,
} from 'lucide-react';

interface ProductImageProps {
  imageUrl?: string | null;
  name: string;
  category?: HardwareCategory | string;
  className?: string;
  alt?: string;
}

interface CategoryTheme {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  accentBorder: string;
  badgeBg: string;
  badgeText: string;
  iconColor: string;
}

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  CPU: {
    icon: Cpu,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-amber-400',
  },
  GPU: {
    icon: Sparkles,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-amber-400',
  },
  Motherboard: {
    icon: Server,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-amber-300',
  },
  RAM: {
    icon: Layers,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-amber-400',
  },
  Storage: {
    icon: HardDrive,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-stone-300',
  },
  PSU: {
    icon: Zap,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-amber-500',
  },
  Case: {
    icon: Box,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-stone-300',
  },
  Cooling: {
    icon: Fan,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-cyan-400',
  },
  Monitor: {
    icon: Monitor,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-stone-300',
  },
  Peripheral: {
    icon: MousePointer,
    accentBorder: 'border-stone-800',
    badgeBg: 'bg-stone-800/80',
    badgeText: 'text-stone-300',
    iconColor: 'text-amber-400',
  },
};

function getInitials(name: string): string {
  if (!name) return 'HW';
  const clean = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 3).toUpperCase() || 'HW';
}

export function ProductImage({
  imageUrl,
  name,
  category = 'Peripheral',
  className = 'w-16 h-16',
  alt,
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES.Peripheral;
  const CategoryIcon = theme.icon;
  const initials = getInitials(name);

  // If valid image and not errored, render img with fallback
  if (imageUrl && !hasError) {
    return (
      <div
        className={`relative overflow-hidden rounded-xl bg-stone-900 border border-stone-800/80 flex items-center justify-center ${className}`}
      >
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center animate-pulse bg-stone-900">
            <CategoryIcon className="w-5 h-5 text-stone-600 opacity-40" />
          </div>
        )}
        <img
          src={imageUrl}
          alt={alt || name}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-all duration-300 ${
            isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        />
      </div>
    );
  }

  // Render Category-Themed Dynamic SVG Placeholder
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-stone-900/90 border border-stone-800 flex flex-col items-center justify-center select-none shadow-sm transition-transform ${className}`}
      title={`${name} (${category})`}
    >
      {/* Background SVG circuit / grid accents */}
      <svg
        className="absolute inset-0 w-full h-full opacity-10 pointer-events-none text-stone-500"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="hw-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="currentColor" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hw-grid)" />
      </svg>

      {/* Central Category Icon & Initials */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-1 p-1 text-center">
        <CategoryIcon className={`w-5 h-5 ${theme.iconColor} drop-shadow-sm`} />
        <span
          className={`text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded ${theme.badgeBg} ${theme.badgeText} border border-stone-700/60`}
        >
          {initials}
        </span>
      </div>

      {/* Category indicator pill on top right */}
      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[8px] font-mono text-stone-400 bg-stone-950/90 rounded border border-stone-800">
        {category}
      </div>
    </div>
  );
}
