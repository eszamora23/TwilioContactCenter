// contact-center/server/src/routes/voiceControl.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import * as vcController from '../controllers/voiceControl.js';

export const voiceControl = Router();

voiceControl.post('/voice/hold/start', requireAuth, vcController.holdStart);
voiceControl.post('/voice/hold/stop', requireAuth, vcController.holdStop);

voiceControl.get('/voice/recordings/status', requireAuth, vcController.recordingStatus);
voiceControl.post('/voice/recordings/start', requireAuth, vcController.recordingStart);
voiceControl.post('/voice/recordings/pause', requireAuth, vcController.recordingPause);
voiceControl.post('/voice/recordings/resume', requireAuth, vcController.recordingResume);
voiceControl.post('/voice/recordings/stop', requireAuth, vcController.recordingStop);

voiceControl.post('/supervise/whisper', requireAuth, vcController.superviseWhisper);
voiceControl.post('/supervise/barge', requireAuth, vcController.superviseBarge);
