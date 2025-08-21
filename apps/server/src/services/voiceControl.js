import { rest } from '../twilio.js';
import { serverEnv as env } from 'shared/env';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function conferenceTwiml(name, { endOnExit = false, beep = false } = {}) {
  return `
<Response>
  <Dial callerId="${esc(env.callerId)}">
    <Conference beep="${beep ? 'true' : 'false'}"
                endConferenceOnExit="${endOnExit ? 'true' : 'false'}">${esc(name)}</Conference>
  </Dial>
</Response>`.trim();
}

export async function waitForConferenceByName(friendlyName, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    const list = await rest.conferences.list({ friendlyName, status: 'in-progress', limit: 1 });
    if (list && list.length) return list[0];
    await sleep(delayMs);
  }
  throw new Error(`Conference "${friendlyName}" not in-progress`);
}

export async function waitForConferenceBySid(confSid, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const c = await rest.conferences(confSid).fetch();
      if (String(c.status).toLowerCase() === 'in-progress') return c;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error(`Conference ${confSid} not in-progress`);
}

export async function waitForParticipantByCallSid(confSid, callSid, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    const parts = await rest.conferences(confSid).participants.list({ limit: 50 });
    const match = parts.find((p) => p.callSid === callSid);
    if (match) return match;
    await sleep(delayMs);
  }
  throw new Error(`Participant ${callSid} not found in conference ${confSid}`);
}

export async function waitUntilParticipantConnected(confSid, callSid, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const p = await rest.conferences(confSid).participants(callSid).fetch();
      if (String(p.status).toLowerCase() === 'connected') return p;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error(`Participant ${callSid} not 'connected' in conference ${confSid}`);
}

export async function getConferenceFromTask(taskSid) {
  const task = await rest.taskrouter.v1.workspaces(env.workspaceSid).tasks(taskSid).fetch();
  let attrs = {};
  try { attrs = JSON.parse(task.attributes || '{}'); } catch {}
  const confSid =
    attrs?.conference?.sid ||
    attrs?.conference?.conference_sid ||
    null;
  const customerCallSid =
    attrs?.conference?.participants?.customer ||
    attrs?.customer?.callSid ||
    attrs?.callSid ||
    null;
  const workerCallSid =
    attrs?.conference?.participants?.worker ||
    attrs?.conference?.participants?.agent ||
    attrs?.worker?.callSid ||
    null;
  if (!confSid) return null;
  return { confSid, customerCallSid, workerCallSid };
}

export async function ensureConferenceReadyByName({ confName, customerCallSid, agentCallSid }) {
  const twimlCust = conferenceTwiml(confName, { endOnExit: true, beep: false });
  const twimlAgnt = conferenceTwiml(confName, { endOnExit: false, beep: false });
  try { await rest.calls(customerCallSid).update({ twiml: twimlCust }); } catch {}
  try { await rest.calls(agentCallSid).update({ twiml: twimlAgnt }); } catch {}
  return await waitForConferenceByName(confName);
}

export async function updateHold(confSid, callSidOrLabel, hold, holdUrl) {
  const payload = hold ? { hold: true, holdUrl } : { hold: false };
  let lastErr;
  for (let i = 0; i < 10; i++) {
    try {
      return await rest.conferences(confSid).participants(callSidOrLabel).update(payload);
    } catch (e) {
      lastErr = e;
      await sleep(250);
    }
  }
  throw lastErr;
}

export async function latestRecordingForCall(callSid) {
  const recs = await rest.calls(callSid).recordings.list({ limit: 20 });
  if (!recs || !recs.length) return null;
  return recs.find((r) => r.status === 'in-progress') || recs.find((r) => r.status === 'paused') || recs[0];
}

export { env };
export const createRecording = (callSid) => rest.calls(callSid).recordings.create({});
export const updateRecording = (callSid, recordingSid, params) => rest.calls(callSid).recordings(recordingSid).update(params);
export const createParticipant = (conferenceSid, params) => rest.conferences(conferenceSid).participants.create(params);

