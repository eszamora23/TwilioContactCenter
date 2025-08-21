import { buildVoiceToken, buildWorkerToken, rest } from '../twilio.js';
import { serverEnv as env } from '@shared/env';

export const fetchWorker = (workerSid) =>
  rest.taskrouter.v1.workspaces(env.workspaceSid).workers(workerSid).fetch();

export const createVoiceToken = (identity) => buildVoiceToken(identity);
export const createWorkerToken = (workerSid) => buildWorkerToken(workerSid);
