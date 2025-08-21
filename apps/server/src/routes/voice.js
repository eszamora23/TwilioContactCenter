import { Router } from 'express';
import { verifyTwilioSignature } from '../middleware/verifyTwilio.js';
import * as voiceController from '../controllers/voice.js';

export const voice = Router();

voice.post('/voice/outbound', verifyTwilioSignature, voiceController.outbound);
