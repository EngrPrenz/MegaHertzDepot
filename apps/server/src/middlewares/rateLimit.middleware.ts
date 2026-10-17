import { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function createRateLimiter(options: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl}:${ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({
        error: 'Too many requests, please try again later',
        retryAfterMs: bucket.resetAt - now,
      });
      return;
    }

    next();
  };
}

