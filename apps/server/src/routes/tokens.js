// contact-center/server/src/routes/tokens.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import * as tokensController from '../controllers/tokens.js';

export const tokens = Router();

tokens.post('/auth/login', tokensController.login);

tokens.get('/token/voice', requireAuth, tokensController.voiceToken);

// contact-center/server/src/routes/tokens.js (only the /token/tr-worker part)
tokens.get('/token/tr-worker', requireAuth, tokensController.workerToken);

