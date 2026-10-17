import { Router } from 'express';
import { SyncController } from '../controllers/sync.controller.js';
import { authenticateJwt } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/push', authenticateJwt, SyncController.push);
router.get('/pull', authenticateJwt, SyncController.pull);

export default router;

