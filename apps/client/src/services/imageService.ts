import { localDb, LocalProductImage } from '../db/index.js';

/**
 * Client-side image compression and local IndexedDB storage service.
 * Compresses images in-browser to max 800x800 WebP and stores them locally in IndexedDB
 * (`localDb.productImages`) referenced by compact `local-img://<id>` URIs so free-plan
 * cloud databases and storage buckets never hit their limits.
 */

export const LOCAL_IMAGE_PREFIX = 'local-img://';

function generateImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isLocalImageUri(url?: string | null): boolean {
  return Boolean(url && url.startsWith(LOCAL_IMAGE_PREFIX));
}

export function extractLocalImageId(url: string): string {
  return url.startsWith(LOCAL_IMAGE_PREFIX) ? url.slice(LOCAL_IMAGE_PREFIX.length) : url;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert image blob to data URL'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(
  file: File | Blob,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.82
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image in canvas'));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP if supported, fallback to JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              canvas.toBlob(
                (fallbackBlob) => {
                  if (fallbackBlob) resolve(fallbackBlob);
                  else reject(new Error('Canvas export failed'));
                },
                'image/jpeg',
                quality
              );
            }
          },
          'image/webp',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses a product image and stores it in the local IndexedDB `productImages` table.
 * Returns a compact `local-img://<uuid>` URI (under 55 chars) so that syncing product metadata
 * never bloats the cloud database or requires external storage buckets.
 */
export async function uploadProductImage(
  file: File | Blob,
  _token?: string | null
): Promise<string> {
  const compressedBlob = await compressImage(file, 800, 800, 0.84);
  const dataUrl = await blobToDataUrl(compressedBlob);
  const id = generateImageId();
  const fileName = file instanceof File ? file.name : `product-${id.slice(0, 8)}.webp`;

  const record: LocalProductImage = {
    id,
    blob: compressedBlob,
    dataUrl,
    mimeType: compressedBlob.type || 'image/webp',
    size: compressedBlob.size,
    fileName,
    createdAt: Date.now(),
  };

  await localDb.productImages.put(record);
  return `${LOCAL_IMAGE_PREFIX}${id}`;
}

export async function deleteLocalProductImage(imageUrl?: string | null): Promise<void> {
  if (!isLocalImageUri(imageUrl)) return;
  const id = extractLocalImageId(imageUrl!);
  await localDb.productImages.delete(id);
}

export async function getLocalImageStorageStats(): Promise<{
  count: number;
  totalBytes: number;
}> {
  const all = await localDb.productImages.toArray();
  const totalBytes = all.reduce((sum, item) => sum + (item.size || 0), 0);
  return {
    count: all.length,
    totalBytes,
  };
}
