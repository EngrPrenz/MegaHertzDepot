import { Request, Response } from 'express';
import { StoreService } from '../services/store.service.js';
import { z } from 'zod';

const createStoreSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
});

const addMemberSchema = z.object({
  email: z.string().email(),
});

export class StoreController {
  public static async list(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const stores = await StoreService.listUserStores(req.user.id);
      res.status(200).json({ stores });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch stores' });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = createStoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid store payload', details: parsed.error.errors });
      return;
    }
    try {
      const store = await StoreService.createStore(req.user.id, parsed.data.name, parsed.data.id);
      res.status(201).json({ store });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create store' });
    }
  }

  public static async addMember(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const storeId = req.params.storeId as string;
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    try {
      const member = await StoreService.addMemberByEmail(req.user.id, storeId, parsed.data.email);
      res.status(200).json({ member });
    } catch (error: any) {
      const status = error.message?.startsWith('Forbidden') ? 403 : 400;
      res.status(status).json({ error: error.message || 'Failed to add member' });
    }
  }
}

