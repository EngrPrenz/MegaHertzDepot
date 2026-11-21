import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { registerSchema, loginSchema, refreshTokenSchema } from '@countwise/shared';

export class AuthController {
  public static async register(req: Request, res: Response): Promise<void> {
    try {
      const validated = registerSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ error: 'Validation failed', details: validated.error.errors });
        return;
      }

      const result = await AuthService.register(validated.data);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Registration failed' });
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
