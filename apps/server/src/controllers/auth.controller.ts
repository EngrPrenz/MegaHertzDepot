import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config.js';
import { registerSchema, loginSchema, refreshTokenSchema } from '@countwise/shared';

function isValidInviteCode(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedHash = crypto.createHash('sha256').update(provided.trim()).digest();
  const expectedHash = crypto.createHash('sha256').update(expected.trim()).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

export class AuthController {
  public static async register(req: Request, res: Response): Promise<void> {
    try {
      const validated = registerSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ error: 'Validation failed', details: validated.error.errors });
        return;
      }

      const requiredCode = (process.env.STAFF_INVITE_CODE || config.STAFF_INVITE_CODE || '').trim();
      if (config.NODE_ENV === 'production' || requiredCode.length > 0) {
        if (!requiredCode || !isValidInviteCode(validated.data.inviteCode, requiredCode)) {
          res.status(403).json({
            error: 'Valid staff invite code is required to register a staff account.',
          });
          return;
        }
      }

      const result = await AuthService.register(validated.data);
      res.status(201).json(result);
    } catch (error: any) {
      const message =
        error?.message === 'User with this email already exists' || config.NODE_ENV !== 'production'
          ? error?.message || 'Registration failed'
          : 'Registration failed';
      res.status(400).json({ error: message });
    }
  }

  public static async login(req: Request, res: Response): Promise<void> {
    try {
      const validated = loginSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ error: 'Validation failed', details: validated.error.errors });
        return;
      }

      const result = await AuthService.login(validated.data);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Login failed' });
    }
  }

  public static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const validated = refreshTokenSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ error: 'Validation failed', details: validated.error.errors });
        return;
      }

      const result = await AuthService.refreshToken(validated.data.refreshToken);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Token refresh failed' });
    }
  }

  public static async registerCustomer(req: Request, res: Response): Promise<void> {
    try {
      const validated = registerSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ error: 'Validation failed', details: validated.error.errors });
        return;
      }

      const result = await AuthService.register(validated.data, 'customer');
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Registration failed' });
    }
  }

  public static async loginCustomer(req: Request, res: Response): Promise<void> {
    try {
      const validated = loginSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ error: 'Validation failed', details: validated.error.errors });
        return;
      }

      const result = await AuthService.login(validated.data, 'customer');
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Login failed' });
    }
  }

  public static async me(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(200).json({ user: req.user });
  }
}
