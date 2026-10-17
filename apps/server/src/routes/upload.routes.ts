import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateJwt } from '../middlewares/auth.middleware.js';

const uploadDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.webp';
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.webp';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `prod-${uniqueSuffix}${cleanExt}`);
  },
});

const upload = multer({
  storage,
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

// Protected upload endpoint
router.post(
  '/',
  authenticateJwt,
  (req: Request, res: Response, _next: NextFunction) => {
    upload.single('image')(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds 2MB limit' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message || 'Failed to upload image' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Return public relative URL
      const relativeUrl = `/uploads/products/${req.file.filename}`;
      return res.status(201).json({
        success: true,
        url: relativeUrl,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
    });
  }
);

export default router;
