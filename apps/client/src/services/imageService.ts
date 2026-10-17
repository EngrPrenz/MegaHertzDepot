/**
 * Client-side image compression and upload service.
 * Compresses images in-browser to max 800x800 WebP to minimize bandwidth and storage.
 */

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
              // Fallback
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
 * Uploads an image to the local backend server.
 * If offline or demo token, returns a local Base64/Object URL so offline works seamlessly.
 */
export async function uploadProductImage(
  file: File | Blob,
  token?: string | null
): Promise<string> {
  // Always compress image first
  const compressedBlob = await compressImage(file, 800, 800, 0.85);

  const isDemoOrOffline = !token || token === 'offline_demo_token' || !navigator.onLine;

  if (isDemoOrOffline) {
    // Offline / Demo fallback: convert blob to Base64 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert offline image to data URL'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to process offline image'));
      reader.readAsDataURL(compressedBlob);
    });
  }

  // Online upload to backend server disk
  const formData = new FormData();
  formData.append('image', compressedBlob, 'product.webp');

  const response = await fetch('/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed with HTTP status ${response.status}`);
  }

  const data = await response.json();
  return data.url;
}
