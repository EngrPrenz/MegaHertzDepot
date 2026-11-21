import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import authRoutes from './routes/auth.routes.js';
import syncRoutes from './routes/sync.routes.js';
import storeRoutes from './routes/store.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import publicRoutes from './routes/public.routes.js';
import { createRateLimiter } from './middlewares/rateLimit.middleware.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(
  cors({
    origin: config.CLIENT_URL.split(','),
    credentials: true,
  })
);

// Serve locally uploaded files statically with safe headers
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  })
);

// Payload size limit (Section 13 Security Checklist)
app.use(express.json({ limit: '2mb' }));

const authRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const syncRateLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const storeRateLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const uploadRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const publicRateLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

// Root info (JSON API info when client dist is not served)
const clientDistDir = path.resolve(process.cwd(), '../client/dist');
const clientIndexHtml = path.join(clientDistDir, 'index.html');
const shouldServeClientSpa =
  config.NODE_ENV === 'production' && fs.existsSync(clientIndexHtml);

if (!shouldServeClientSpa) {
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Countwise Offline-First Sync API',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
    });
  });
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/auth', authRateLimiter, authRoutes);
app.use('/stores', storeRateLimiter, storeRoutes);
app.use('/sync', syncRateLimiter, syncRoutes);
app.use('/upload', uploadRateLimiter, uploadRoutes);
app.use('/public', publicRateLimiter, publicRoutes);

if (shouldServeClientSpa) {
  app.use(express.static(clientDistDir));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    const p = req.path;
    if (
      p.startsWith('/auth') ||
      p.startsWith('/stores') ||
      p.startsWith('/sync') ||
      p.startsWith('/upload') ||
      p.startsWith('/uploads') ||
      p.startsWith('/public') ||
      p === '/health'
    ) {
      next();
      return;
    }
    res.sendFile(clientIndexHtml);
  });
}

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err);
  if (err?.code === 'ECONNREFUSED' || err?.code === '57P01') {
    res.status(503).json({
      error: 'Database temporarily unavailable. Changes remain safe offline.',
    });
    return;
  }
  const status = err?.status || 500;
  res.status(status).json({
    error:
      config.NODE_ENV === 'production' && status >= 500
        ? 'Internal Server Error'
        : err?.message || 'Internal Server Error',
  });
});
