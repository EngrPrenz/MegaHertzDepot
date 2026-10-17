import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config.js';
import authRoutes from './routes/auth.routes.js';
import syncRoutes from './routes/sync.routes.js';
import storeRoutes from './routes/store.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import { createRateLimiter } from './middlewares/rateLimit.middleware.js';

export const app = express();

app.use(
  cors({
    origin: config.CLIENT_URL.split(','),
    credentials: true,
  })
);

// Serve locally uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Payload size limit (Section 13 Security Checklist)
app.use(express.json({ limit: '2mb' }));

const authRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const syncRateLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

// Root info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Countwise Offline-First Sync API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

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
app.use('/stores', storeRoutes);
app.use('/sync', syncRateLimiter, syncRoutes);
app.use('/upload', uploadRoutes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});
