import { rest } from '../twilio.js';
import { serverEnv as env } from '@shared/env';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function conferenceTwiml(name, { endOnExit = false, beep = false } = {}) {
  return `
<Response>
  <Dial callerId="${esc(env.callerId)}">
    <Conference beep="${beep ? 'true' : 'false'}"
                endConferenceOnExit="${endOnExit ? 'true' : 'false'}">${esc(name)}</Conference>
  </Dial>
</Response>`.trim();
}

function normalizeTargetIdentity(targetIdentity) {
  const raw = String(targetIdentity || '').trim();
  if (!raw) return '';
  if (raw.startsWith('client:')) return raw;
  if (raw.startsWith('agent:'))  return `client:${raw}`;
  return `client:agent:${raw}`;
}

async function waitUntilInProgress(callSid, { tries = 8, delayMs = 250 } = {}) {
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

export async function coldTransfer({ customerCallSid, targetIdentity, agentCallSid }) {
  const toClient = normalizeTargetIdentity(targetIdentity);
  await waitUntilInProgress(customerCallSid);
  const twiml = `
<Response>
  <Dial callerId="${esc(env.callerId)}">
    <Client>${esc(toClient.replace('client:', ''))}</Client>
  </Dial>
</Response>`.trim();
  await rest.calls(customerCallSid).update({ twiml });
  if (agentCallSid) {
    try { await rest.calls(agentCallSid).update({ status: 'completed' }); } catch {}
  }
  return { ok: true, mode: 'cold' };
}

export async function warmTransfer({ taskSid, customerCallSid, agentCallSid, targetIdentity }) {
  const toClient = normalizeTargetIdentity(targetIdentity);
  await waitUntilInProgress(customerCallSid);
  await waitUntilInProgress(agentCallSid);
  const confName = taskSid ? `task-${taskSid}` : `xfer-${customerCallSid}`;
  const twimlCustomer = conferenceTwiml(confName, { endOnExit: true, beep: false });
  await rest.calls(customerCallSid).update({ twiml: twimlCustomer });
  const twimlAgent = conferenceTwiml(confName, { endOnExit: false, beep: false });
  await rest.calls(agentCallSid).update({ twiml: twimlAgent });
  const twimlTarget = conferenceTwiml(confName, { endOnExit: false, beep: true });
  await rest.calls.create({
    to: toClient,
    from: env.callerId,
    twiml: twimlTarget
  });
  return { ok: true, mode: 'warm', conference: confName };
}

export async function completeTransfer(agentCallSid) {
  await rest.calls(agentCallSid).update({ status: 'completed' });
  return { ok: true };
}
