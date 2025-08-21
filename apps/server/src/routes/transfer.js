import { Router } from 'express';
import { requireAuth } from 'shared/auth';
import { cold, warm, complete } from '../controllers/transfer.js';

export const transfer = Router();
transfer.post('/transfer/cold', requireAuth, cold);
transfer.post('/transfer/warm', requireAuth, warm);
transfer.post('/transfer/complete', requireAuth, complete);

