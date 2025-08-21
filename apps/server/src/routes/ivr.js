import { Router } from 'express';
import {
  lookup,
  serviceStatus,
  scheduleService,
  checkRecalls,
  financeBalance,
  financePaylink
} from '../controllers/ivr.js';

export const ivr = Router();
ivr.post('/ivr/lookup', lookup);
ivr.post('/ivr/service/status', serviceStatus);
ivr.post('/ivr/service/schedule', scheduleService);
ivr.post('/ivr/recalls/check', checkRecalls);
ivr.post('/ivr/finance/balance', financeBalance);
ivr.post('/ivr/finance/paylink', financePaylink);
