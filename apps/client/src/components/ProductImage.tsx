import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HardwareCategory, getDefaultCatalogImageUrl } from '@countwise/shared';
import { localDb } from '../db/index.js';
import { isLocalImageUri, extractLocalImageId } from '../services/imageService.js';
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
  Laptop,
} from 'lucide-react';

interface ProductImageProps {
  imageUrl?: string | null;
  sku?: string | null;
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
  Laptop: {
    icon: Laptop,
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
  sku,
  name,
  category = 'Peripheral',
  className = 'w-16 h-16',
  alt,
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const isLocalIdb = isLocalImageUri(imageUrl);
  const localImageId = isLocalIdb && imageUrl ? extractLocalImageId(imageUrl) : null;

  // Query IndexedDB `productImages` table when `local-img://<id>` is used
  const localRecord = useLiveQuery(
    async () => {
      if (!localImageId) return undefined;
      return localDb.productImages.get(localImageId);
    },
    [localImageId],
    undefined
  );

  // Resolve effective image URL:
  // 1. Local IndexedDB blob dataUrl if `local-img://`
  // 2. Direct URL / public static path if standard string
  // 3. Automatic fallback to static `/images/products/<SKU>.svg` if SKU or Name matches catalog
  const catalogFallbackUrl = getDefaultCatalogImageUrl(sku, name);
  const resolvedSrc = isLocalIdb
    ? localRecord?.dataUrl || catalogFallbackUrl || null
    : imageUrl || catalogFallbackUrl || null;

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [resolvedSrc]);

  const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES.Peripheral;
  const CategoryIcon = theme.icon;
  const initials = getInitials(name);

  const isInlineDataUrl = Boolean(resolvedSrc && resolvedSrc.startsWith('data:'));

  // If valid resolved image and not errored, render img with fallback
  if (resolvedSrc && !hasError) {
    return (
      <div
        className={`relative overflow-hidden rounded-xl bg-stone-900 border border-stone-800/80 flex items-center justify-center ${className}`}
      >
        {!isLoaded && !isInlineDataUrl && (
          <div className="absolute inset-0 flex items-center justify-center animate-pulse bg-stone-900">
            <CategoryIcon className="w-5 h-5 text-stone-600 opacity-40" />
          </div>
        )}
        <img
          src={resolvedSrc}
          alt={alt || name}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-all duration-200 ${
            isLoaded || isInlineDataUrl ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
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
