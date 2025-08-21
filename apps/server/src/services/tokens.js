import { buildVoiceToken, buildWorkerToken, rest } from '../twilio.js';
import { signAgentToken } from '@shared/auth';
import { serverEnv as env } from '@shared/env';

export async function login(agentId, workerSid, identity) {
  const worker = await rest.taskrouter.v1
    .workspaces(env.workspaceSid)
    .workers(workerSid)
    .fetch();
  const attrs = JSON.parse(worker.attributes || '{}');
  if (!attrs.contact_uri || attrs.contact_uri !== identity) {
    const err = new Error('identity mismatch with worker.contact_uri');
    err.details = { expected: identity, got: attrs.contact_uri || null };
    throw err;
  }
  return {
    token: signAgentToken(agentId, workerSid, identity),
    agent: { id: agentId, workerSid, identity }
  };
}

export const voiceToken = (identity) => ({ token: buildVoiceToken(identity) });
export const workerToken = (workerSid) => ({ token: buildWorkerToken(workerSid) });
