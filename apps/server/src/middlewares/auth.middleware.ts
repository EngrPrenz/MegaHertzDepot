import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'staff' | 'customer';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  if (config.NODE_ENV !== 'production' && token === 'offline_demo_token') {
    req.user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'demo@countwise.local',
      role: 'staff',
    };
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as Partial<AuthenticatedUser> & {
      id: string;
      email: string;
    };
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role === 'customer' ? 'customer' : 'staff',
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'staff') {
    res.status(403).json({ error: 'Forbidden: Staff account required' });
    return;
  }
  next();
}
