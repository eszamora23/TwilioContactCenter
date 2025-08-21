import { rest } from '../twilio.js';
import { serverEnv as env } from '@shared/env';

export async function waitUntilInProgress(callSid, { tries = 8, delayMs = 250 } = {}) {
  for (let i = 0; i < tries; i++) {
    const c = await rest.calls(callSid).fetch();
    if (c.status === 'in-progress') return c;
    if (['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(c.status)) {
      const err = new Error(`Call ${callSid} is ${c.status}, cannot redirect`);
      err.code = 'NOT_REDIRECTABLE';
      err.twilioStatus = c.status;
      throw err;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const c = await rest.calls(callSid).fetch();
  const err = new Error(`Call ${callSid} still ${c.status}, not in-progress`);
  err.code = 'NOT_IN_PROGRESS';
  err.twilioStatus = c.status;
  throw err;
}

export const updateCall = (sid, params) => rest.calls(sid).update(params);
export const createCall = (params) => rest.calls.create(params);
export { env };
