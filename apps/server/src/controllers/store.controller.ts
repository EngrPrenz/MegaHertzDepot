import { Request, Response } from 'express';
import { StoreService } from '../services/store.service.js';
import { config } from '../config.js';
import { z } from 'zod';

const createStoreSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
});

const addMemberSchema = z.object({
  email: z.string().email(),
});

const storeIdParamSchema = z.string().uuid();

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
      console.error('Store list error:', error);
      res.status(500).json({
        error:
          config.NODE_ENV === 'production'
            ? 'Internal Server Error'
            : error.message || 'Failed to fetch stores',
      });
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
      console.error('Store create error:', error);
      res.status(400).json({
        error:
          error?.message === 'Store name is required' || config.NODE_ENV !== 'production'
            ? error.message || 'Failed to create store'
            : 'Failed to create store',
      });
    }
  }

  public static async addMember(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const storeIdParsed = storeIdParamSchema.safeParse(req.params.storeId);
    if (!storeIdParsed.success) {
      res.status(400).json({ error: 'Invalid storeId parameter' });
      return;
    }
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    try {
      const member = await StoreService.addMemberByEmail(
        req.user.id,
        storeIdParsed.data,
        parsed.data.email
      );
      res.status(200).json({ member });
    } catch (error: any) {
      const isKnown =
        error?.message?.startsWith('Forbidden') ||
        error?.message === 'Unable to add member for that email address';
      const status = error.message?.startsWith('Forbidden') ? 403 : isKnown ? 400 : 500;
      if (status >= 500) {
        console.error('Store addMember error:', error);
      }
      res.status(status).json({
        error:
          config.NODE_ENV === 'production' && status >= 500
            ? 'Internal Server Error'
            : error.message || 'Failed to add member',
      });
    }
  }
}

