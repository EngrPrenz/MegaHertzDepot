import { Router } from 'express';
import { StoreController } from '../controllers/store.controller.js';
import { authenticateJwt, requireStaff } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticateJwt, requireStaff, StoreController.list);
router.post('/', authenticateJwt, requireStaff, StoreController.create);
router.post('/:storeId/members', authenticateJwt, requireStaff, StoreController.addMember);

export default router;

