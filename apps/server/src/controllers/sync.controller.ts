import { Request, Response } from 'express';
import { SyncService } from '../services/sync.service.js';
import { syncPushRequestSchema, syncPullQuerySchema } from '@countwise/shared';

export class SyncController {
  public static async push(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = syncPushRequestSchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({
        error: 'Invalid sync push payload',
        details: validated.error.errors,
      });
      return;
    }

    try {
      const response = await SyncService.push(req.user.id, validated.data);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(error.status || 500).json({
        error: error.message || 'Sync push failed',
      });
    }
  }

  public static async pull(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = syncPullQuerySchema.safeParse(req.query);
    if (!validated.success) {
      res.status(400).json({
        error: 'Invalid sync pull query parameters',
        details: validated.error.errors,
      });
      return;
    }

    try {
      const response = await SyncService.pull(req.user.id, validated.data);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(error.status || 500).json({
        error: error.message || 'Sync pull failed',
      });
    }
  }
}

