// contact-center/server/src/routes/video.js
import { Router } from 'express';
import { requireAuth } from 'shared/auth';
import { videoController } from '../controllers/video.js';

export const video = Router();

video.get('/video/enabled', videoController.enabled);
video.post('/video/ensure-room', videoController.ensureRoom); // sin auth: lo usa también el webchat público

video.get('/video/token', requireAuth, videoController.tokenAgent);
video.get('/video/token/guest', videoController.tokenGuest);
