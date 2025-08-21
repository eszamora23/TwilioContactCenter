// contact-center/server/src/routes/transfer.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import * as transferController from '../controllers/transfer.js';

export const transfer = Router();

transfer.post('/transfer/cold', requireAuth, transferController.cold);

transfer.post('/transfer/warm', requireAuth, transferController.warm);

transfer.post('/transfer/complete', requireAuth, transferController.complete);
