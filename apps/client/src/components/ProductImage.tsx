import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  CPU: Cpu,
  GPU: Sparkles,
  Motherboard: Server,
  RAM: Layers,
  Storage: HardDrive,
  PSU: Zap,
  Case: Box,
  Cooling: Fan,
  Monitor: Monitor,
  Peripheral: MousePointer,
  Laptop: Laptop,
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

function isSafeImageSrc(src?: string | null): boolean {
  if (!src) return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/')) return true;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return true;
  return /^data:image\/(webp|png|jpeg|gif);base64,/i.test(trimmed);
}

export function ProductImage({
  imageUrl,
  sku,
  name,
  category = 'Peripheral',
  className = 'w-16 h-16',
  alt,
}: ProductImageProps) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

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

  // Resolve candidate image URLs in priority order:
  // 1. Local IndexedDB blob dataUrl if `local-img://`
  // 2. Direct URL / public static path if standard string
  // 3. Automatic fallback to static `/images/products/<SKU>.webp` if SKU or Name matches catalog
  const catalogFallbackUrl = getDefaultCatalogImageUrl(sku, name);
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (isLocalIdb) {
      if (isSafeImageSrc(localRecord?.dataUrl)) {
        list.push(localRecord!.dataUrl);
      }
    } else if (isSafeImageSrc(imageUrl)) {
      list.push(imageUrl!);
    }
    if (isSafeImageSrc(catalogFallbackUrl) && !list.includes(catalogFallbackUrl!)) {
      list.push(catalogFallbackUrl!);
    }
    return list;
  }, [isLocalIdb, localRecord?.dataUrl, imageUrl, catalogFallbackUrl]);

  const candidatesKey = candidates.join('|');
  useEffect(() => {
    setCandidateIndex(0);
  }, [candidatesKey]);

  const resolvedSrc = candidates[candidateIndex] ?? null;

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    } else {
      setIsLoaded(false);
    }
  }, [resolvedSrc]);

  const CategoryIcon = CATEGORY_ICONS[category] || CATEGORY_ICONS.Peripheral;
  const initials = getInitials(name);
  const isInlineDataUrl = Boolean(resolvedSrc && resolvedSrc.startsWith('data:'));

  if (resolvedSrc) {
    return (
      <div
        className={`relative overflow-hidden rounded-md bg-white dark:bg-zinc-100 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center p-2 ${className}`}
      >
        {!isLoaded && !isInlineDataUrl && (
          <div className="absolute inset-0 flex items-center justify-center animate-pulse bg-zinc-100 dark:bg-zinc-200">
            <CategoryIcon className="w-5 h-5 text-zinc-400 dark:text-zinc-500" strokeWidth={1.75} />
          </div>
        )}
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt || name}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setCandidateIndex((idx) => idx + 1)}
          className={`w-full h-full object-contain transition-opacity duration-150 ${
            isLoaded || isInlineDataUrl ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-md bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1 p-1.5 text-center ${className}`}
      title={`${name} (${category})`}
    >
      <CategoryIcon className="w-5 h-5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white dark:bg-carbon text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
        {initials}
      </span>
    </div>
  );
}
