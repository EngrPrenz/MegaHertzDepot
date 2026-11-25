import { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

const cleanupInterval = setInterval(() => {
  pruneExpiredBuckets(Date.now());
}, 60_000);
if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

const MAX_BUCKETS = 10_000;

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix || req.baseUrl}:${ip}`;
    const now = Date.now();

    if (buckets.size > 5000) {
      pruneExpiredBuckets(now);
    }

    if (buckets.size >= MAX_BUCKETS) {
      for (const oldKey of buckets.keys()) {
        buckets.delete(oldKey);
        if (buckets.size < MAX_BUCKETS) {
          break;
        }
      }
    }

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

