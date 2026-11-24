import crypto from 'node:crypto';
import path from 'node:path';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateJwt, requireStaff } from '../middlewares/auth.middleware.js';
import { db } from '../db/index.js';
import { uploadedImages } from '../db/schema.js';
import { isPostgresAvailable, memoryDb } from '../db/memory-fallback.js';

function hasValidImageMagicBytes(buf: Buffer): boolean {
  if (!buf || buf.length < 6) return false;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WEBP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  // GIF: GIF87a or GIF89a
  const header6 = buf.subarray(0, 6).toString('ascii');
  if (header6 === 'GIF87a' || header6 === 'GIF89a') return true;

  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
  },
});

const router = Router();

// Protected upload endpoint (Staff only + magic-byte validation + persistent DB storage)
router.post(
  '/',
  authenticateJwt,
  requireStaff,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('image')(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds 2MB limit' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message || 'Failed to upload image' });
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      if (!hasValidImageMagicBytes(req.file.buffer)) {
        return res.status(400).json({
          error: 'Invalid image file content. File signature does not match an allowed image format.',
        });
      }

      const ext = path.extname(req.file.originalname).toLowerCase() || '.webp';
      const cleanExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.webp';
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const filename = `prod-${uniqueSuffix}${cleanExt}`;
      const sizeBytes = req.file.size ?? req.file.buffer.length;
      const dataBase64 = req.file.buffer.toString('base64');

      try {
        const usePg = await isPostgresAvailable();
        if (usePg) {
          await db.insert(uploadedImages).values({
            filename,
            mimeType: req.file.mimetype,
            dataBase64,
            sizeBytes,
          });
        } else {
          memoryDb.uploadedImages.set(filename, {
            id: crypto.randomUUID(),
            filename,
            mimeType: req.file.mimetype,
            dataBase64,
            sizeBytes,
            createdAt: new Date(),
          });
        }

        const relativeUrl = `/uploads/products/${filename}`;
        return res.status(201).json({
          success: true,
          url: relativeUrl,
          filename,
          size: sizeBytes,
          mimetype: req.file.mimetype,
        });
      } catch (persistErr) {
        return next(persistErr);
      }
    });
  }
);

export default router;
