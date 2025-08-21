import { Router } from 'express';
import { checkHealth } from '../controllers/health.js';

export const health = Router().get('/health', checkHealth);
