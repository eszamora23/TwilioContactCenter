import { env, waitUntilInProgress, updateCall, createCall } from '../services/transfer.js';

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
  if (raw.startsWith('agent:')) return `client:${raw}`;
  return `client:agent:${raw}`;
}

export async function cold(req, res) {
  try {
    const { customerCallSid, targetIdentity, agentCallSid } = req.body || {};
    if (!customerCallSid || !targetIdentity) {
      return res.status(400).json({ error: 'missing customerCallSid or targetIdentity' });
    }
    const toClient = normalizeTargetIdentity(targetIdentity);
    if (!toClient) return res.status(400).json({ error: 'invalid targetIdentity' });
    try {
      await waitUntilInProgress(customerCallSid);
    } catch (e) {
      return res.status(409).json({
        error: 'call not in-progress',
        details: e.message,
        twilioStatus: e.twilioStatus || undefined
      });
    }
    const twiml = `
<Response>
  <Dial callerId="${esc(env.callerId)}">
    <Client>${esc(toClient.replace('client:', ''))}</Client>
  </Dial>
</Response>`.trim();
    await updateCall(customerCallSid, { twiml });
    if (agentCallSid) {
      try { await updateCall(agentCallSid, { status: 'completed' }); } catch {}
    }
    return res.json({ ok: true, mode: 'cold' });
  } catch (e) {
    console.error('[TRANSFER/COLD] error', e);
    return res.status(500).json({ error: 'cold transfer failed' });
  }
}

export async function warm(req, res) {
  try {
    const { taskSid, customerCallSid, agentCallSid, targetIdentity } = req.body || {};
    if (!customerCallSid || !agentCallSid || !targetIdentity) {
      return res.status(400).json({ error: 'missing required fields' });
    }
    const toClient = normalizeTargetIdentity(targetIdentity);
    if (!toClient) return res.status(400).json({ error: 'invalid targetIdentity' });
    try {
      await waitUntilInProgress(customerCallSid);
      await waitUntilInProgress(agentCallSid);
    } catch (e) {
      return res.status(409).json({
        error: 'call not in-progress',
        details: e.message,
        twilioStatus: e.twilioStatus || undefined
      });
    }
    const confName = taskSid ? `task-${taskSid}` : `xfer-${customerCallSid}`;
    const twimlCustomer = conferenceTwiml(confName, { endOnExit: true, beep: false });
    await updateCall(customerCallSid, { twiml: twimlCustomer });
    const twimlAgent = conferenceTwiml(confName, { endOnExit: false, beep: false });
    await updateCall(agentCallSid, { twiml: twimlAgent });
    const twimlTarget = conferenceTwiml(confName, { endOnExit: false, beep: true });
    await createCall({ to: toClient, from: env.callerId, twiml: twimlTarget });
    return res.json({ ok: true, mode: 'warm', conference: confName });
  } catch (e) {
    console.error('[TRANSFER/WARM] error', e);
    return res.status(500).json({ error: 'warm transfer failed' });
  }
}

export async function complete(req, res) {
  try {
    const { agentCallSid } = req.body || {};
    if (!agentCallSid) return res.status(400).json({ error: 'missing agentCallSid' });
    await updateCall(agentCallSid, { status: 'completed' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[TRANSFER/COMPLETE] error', e);
    return res.status(500).json({ error: 'complete transfer failed' });
  }
}
