import { Router } from 'express';
import * as ivrController from '../controllers/ivr.js';

export const ivr = Router();

/**
 * Each IVR endpoint returns compact JSON usable by Studio:
 *  - data payload for logic
 *  - optional 'say' string if you want TTS quickly
 */

ivr.post('/ivr/lookup', ivrController.lookup);

ivr.post('/ivr/service/status', ivrController.serviceStatus);

ivr.post('/ivr/service/schedule', ivrController.serviceSchedule);

ivr.post('/ivr/recalls/check', ivrController.recallsCheck);

ivr.post('/ivr/finance/balance', ivrController.financeBalance);

ivr.post('/ivr/finance/paylink', ivrController.financePaylink);
