import { Router } from 'express';
import { SyncController } from '../controllers/sync.controller.js';
import { authenticateJwt, requireStaff } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/push', authenticateJwt, requireStaff, SyncController.push);
router.get('/pull', authenticateJwt, requireStaff, SyncController.pull);

export default router;

