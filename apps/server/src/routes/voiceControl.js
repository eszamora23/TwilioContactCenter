import { Router } from 'express';
import { requireAuth } from 'shared/auth';
import {
  holdStart,
  holdStop,
  recordingStatus,
  recordingStart,
  recordingPause,
  recordingResume,
  recordingStop,
  superviseWhisper,
  superviseBarge
} from '../controllers/voiceControl.js';

export const voiceControl = Router();
voiceControl.post('/voice/hold/start', requireAuth, holdStart);
voiceControl.post('/voice/hold/stop', requireAuth, holdStop);
voiceControl.get('/voice/recordings/status', requireAuth, recordingStatus);
voiceControl.post('/voice/recordings/start', requireAuth, recordingStart);
voiceControl.post('/voice/recordings/pause', requireAuth, recordingPause);
voiceControl.post('/voice/recordings/resume', requireAuth, recordingResume);
voiceControl.post('/voice/recordings/stop', requireAuth, recordingStop);
voiceControl.post('/supervise/whisper', requireAuth, superviseWhisper);
voiceControl.post('/supervise/barge', requireAuth, superviseBarge);

