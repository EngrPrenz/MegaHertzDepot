import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.routes.js';

export const app = express();

app.use(cors({
  origin: config.CLIENT_URL.split(','),
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

// Root info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Countwise Offline-First Sync API',
    version: '0.1.0',
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
app.use('/auth', authRoutes);

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
