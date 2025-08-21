import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import { login, voiceToken, workerToken } from '../controllers/tokens.js';

export const tokens = Router();
tokens.post('/auth/login', login);
tokens.get('/token/voice', requireAuth, voiceToken);
tokens.get('/token/tr-worker', requireAuth, workerToken);
