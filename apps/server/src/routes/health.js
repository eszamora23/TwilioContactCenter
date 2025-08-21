import { Router } from 'express';
import { getHealth } from '../controllers/health.js';

export const health = Router().get('/health', getHealth);
