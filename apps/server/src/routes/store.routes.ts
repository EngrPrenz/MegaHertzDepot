import { Router } from 'express';
import { StoreController } from '../controllers/store.controller.js';
import { authenticateJwt } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticateJwt, StoreController.list);
router.post('/', authenticateJwt, StoreController.create);
router.post('/:storeId/members', authenticateJwt, StoreController.addMember);

export default router;

