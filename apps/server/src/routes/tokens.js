import { Router } from 'express';
import { requireAuth } from 'shared/auth';
import { login, refresh, logout, voiceToken, workerToken } from '../controllers/tokens.js';

export const tokens = Router();
tokens.post('/auth/login', login);
tokens.post('/auth/refresh', refresh);
tokens.post('/auth/logout', logout);
tokens.get('/token/voice', requireAuth, voiceToken);
tokens.get('/token/tr-worker', requireAuth, workerToken);

