// contact-center/server/src/routes/voiceControl.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import { rest } from '../twilio.js';
import { serverEnv as env } from '@shared/env';
import { pushEvent } from './taskrouter.js';

export const voiceControl = Router();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function conferenceTwiml(name, { endOnExit = false, beep = false } = {}) {
  return `
<Response>
  <Dial callerId="${esc(env.callerId)}">
    <Conference beep="${beep ? 'true' : 'false'}"
                endConferenceOnExit="${endOnExit ? 'true' : 'false'}">${esc(name)}</Conference>
  </Dial>
</Response>`.trim();
}

/* -------------------- waiters -------------------- */
async function waitForConferenceByName(friendlyName, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    const list = await rest.conferences.list({ friendlyName, status: 'in-progress', limit: 1 });
    if (list && list.length) return list[0];
    await sleep(delayMs);
  }
  throw new Error(`Conference "${friendlyName}" not in-progress`);
}

async function waitForConferenceBySid(confSid, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const c = await rest.conferences(confSid).fetch();
      if (String(c.status).toLowerCase() === 'in-progress') return c;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error(`Conference ${confSid} not in-progress`);
}

async function waitForParticipantByCallSid(confSid, callSid, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    const parts = await rest.conferences(confSid).participants.list({ limit: 50 });
    const match = parts.find((p) => p.callSid === callSid);
    if (match) return match;
    await sleep(delayMs);
  }
  throw new Error(`Participant ${callSid} not found in conference ${confSid}`);
}

async function waitUntilParticipantConnected(confSid, callSid, { tries = 60, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const p = await rest.conferences(confSid).participants(callSid).fetch();
      if (String(p.status).toLowerCase() === 'connected') return p;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error(`Participant ${callSid} not 'connected' in conference ${confSid}`);
}

/* -------------------- TaskRouter helpers -------------------- */
async function getConferenceFromTask(taskSid) {
  const task = await rest.taskrouter.v1
    .workspaces(env.workspaceSid)
    .tasks(taskSid)
    .fetch();

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

/* -------------------- synthesize conference (no taskSid case) -------------------- */
async function ensureConferenceReadyByName({ confName, customerCallSid, agentCallSid }) {
  const twimlCust = conferenceTwiml(confName, { endOnExit: true, beep: false });
  const twimlAgnt = conferenceTwiml(confName, { endOnExit: false, beep: false });
  try { await rest.calls(customerCallSid).update({ twiml: twimlCust }); } catch {}
  try { await rest.calls(agentCallSid).update({ twiml: twimlAgnt }); } catch {}
  return await waitForConferenceByName(confName);
}

/* -------------------- participant update -------------------- */
async function updateHold(confSid, callSidOrLabel, hold, holdUrl) {
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

/* =================== HOLD / RESUME =================== */
const holdMap = new Map(); // Optional in-memory tracking for hold durations

voiceControl.post('/voice/hold/start', requireAuth, async (req, res) => {
  try {
    const { taskSid, customerCallSid, agentCallSid, who = 'customer' } = req.body || {};
    if (!customerCallSid || !agentCallSid) {
      return res.status(400).json({ error: 'missing callSids', need: ['customerCallSid','agentCallSid'] });
    }

    let confSid, targetCallSid;

    if (taskSid) {
      // Preferred: get CF + CA SIDs from Task attributes
      const info = await getConferenceFromTask(taskSid);
      if (info?.confSid) {
        confSid = info.confSid;
        targetCallSid = (who === 'agent')
          ? (info.workerCallSid || agentCallSid)
          : (info.customerCallSid || customerCallSid);

        await waitForConferenceBySid(confSid);
      } else {
        // Attributes not populated yet -> conference name is the Task SID
        const conf = await waitForConferenceByName(taskSid);
        confSid = conf.sid;
        targetCallSid = (who === 'agent') ? agentCallSid : customerCallSid;
      }
    } else {
      // No Task (ad-hoc): create/join a named conference for both legs
      const conf = await ensureConferenceReadyByName({
        confName: `xfer-${customerCallSid}`,
        customerCallSid,
        agentCallSid
      });
      confSid = conf.sid;
      targetCallSid = (who === 'agent') ? agentCallSid : customerCallSid;
    }

    await waitForParticipantByCallSid(confSid, targetCallSid);
    await waitUntilParticipantConnected(confSid, targetCallSid);

    await updateHold(confSid, targetCallSid, true, env.holdMusicUrl);

    // Optional tracking
    holdMap.set(targetCallSid, Date.now());

    pushEvent('HOLD_START', { confSid, target: who });
    res.json({ ok: true, confSid, who });
  } catch (e) {
    console.error('[HOLD/START] error', e);
    res.status(500).json({ error: 'cannot hold', details: e?.message });
  }
});

voiceControl.post('/voice/hold/stop', requireAuth, async (req, res) => {
  try {
    const { taskSid, customerCallSid, agentCallSid, who = 'customer' } = req.body || {};
    if (!customerCallSid || !agentCallSid) {
      return res.status(400).json({ error: 'missing callSids', need: ['customerCallSid','agentCallSid'] });
    }

    let confSid, targetCallSid;

    if (taskSid) {
      const info = await getConferenceFromTask(taskSid);
      if (info?.confSid) {
        confSid = info.confSid;
        targetCallSid = (who === 'agent')
          ? (info.workerCallSid || agentCallSid)
          : (info.customerCallSid || customerCallSid);

        await waitForConferenceBySid(confSid);
      } else {
        const conf = await waitForConferenceByName(taskSid);
        confSid = conf.sid;
        targetCallSid = (who === 'agent') ? agentCallSid : customerCallSid;
      }
    } else {
      const conf = await waitForConferenceByName(`xfer-${customerCallSid}`);
      confSid = conf.sid;
      targetCallSid = (who === 'agent') ? agentCallSid : customerCallSid;
    }

    await waitForParticipantByCallSid(confSid, targetCallSid);
    await waitUntilParticipantConnected(confSid, targetCallSid);

    await updateHold(confSid, targetCallSid, false, undefined);

    // Optional duration calculation
    const holdStart = holdMap.get(targetCallSid);
    if (holdStart) {
      const duration = Math.floor((Date.now() - holdStart) / 1000);
      holdMap.delete(targetCallSid);
      // Could return duration in response if client needs it server-side
      console.log(`Hold duration for ${targetCallSid}: ${duration}s`);
    }

    pushEvent('HOLD_STOP', { confSid, target: who });
    res.json({ ok: true, confSid, who });
  } catch (e) {
    console.error('[HOLD/STOP] error', e);
    res.status(500).json({ error: 'cannot unhold', details: e?.message });
  }
});

/* =================== RECORDINGS =================== */
async function latestRecordingForCall(callSid) {
  const recs = await rest.calls(callSid).recordings.list({ limit: 20 });
  if (!recs || !recs.length) return null;
  return recs.find((r) => r.status === 'in-progress') || recs.find((r) => r.status === 'paused') || recs[0];
}

voiceControl.get('/voice/recordings/status', requireAuth, async (req, res) => {
  try {
    const { callSid } = req.query || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    const status = rec ? rec.status : 'inactive';
    res.json({ status });
  } catch (e) {
    console.error('[REC/STATUS] error', e);
    res.status(500).json({ error: 'cannot get recording status', details: e?.message });
  }
});

voiceControl.post('/voice/recordings/start', requireAuth, async (req, res) => {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await rest.calls(callSid).recordings.create({});
    pushEvent('REC_START', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/START] error', e);
    res.status(500).json({ error: 'cannot start recording', details: e?.message });
  }
});

voiceControl.post('/voice/recordings/pause', requireAuth, async (req, res) => {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    await rest.calls(callSid).recordings(rec.sid).update({ status: 'paused', pauseBehavior: 'silence' });
    pushEvent('REC_PAUSE', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/PAUSE] error', e);
    res.status(500).json({ error: 'cannot pause recording', details: e?.message });
  }
});

voiceControl.post('/voice/recordings/resume', requireAuth, async (req, res) => {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    await rest.calls(callSid).recordings(rec.sid).update({ status: 'in-progress' });
    pushEvent('REC_RESUME', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/RESUME] error', e);
    res.status(500).json({ error: 'cannot resume recording', details: e?.message });
  }
});

voiceControl.post('/voice/recordings/stop', requireAuth, async (req, res) => {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    await rest.calls(callSid).recordings(rec.sid).update({ status: 'stopped' });
    pushEvent('REC_STOP', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/STOP] error', e);
    res.status(500).json({ error: 'cannot stop recording', details: e?.message });
  }
});

/* =================== SUPERVISION (unchanged) =================== */
voiceControl.post('/supervise/whisper', requireAuth, async (req, res) => {
  try {
    const { conferenceName, supervisorIdentity, coachCallSid } = req.body || {};
    if (!conferenceName || !supervisorIdentity || !coachCallSid) {
      return res.status(400).json({ error: 'missing fields' });
    }
    const conf = await waitForConferenceByName(conferenceName);
    const to = supervisorIdentity.startsWith('client:') ? supervisorIdentity : `client:${supervisorIdentity}`;

    const participant = await rest.conferences(conf.sid).participants.create({
      to,
      from: env.callerId,
      earlyMedia: true,
      coaching: true,
      callSidToCoach: coachCallSid
    });

    pushEvent('SUPERVISE_WHISPER', { conferenceSid: conf.sid, supervisorIdentity, coachCallSid });
    res.json({ ok: true, participantSid: participant.callSid });
  } catch (e) {
    console.error('[SUPERVISE/WHISPER] error', e);
    res.status(500).json({ error: 'cannot create whisper participant', details: e?.message });
  }
});

voiceControl.post('/supervise/barge', requireAuth, async (req, res) => {
  try {
    const { conferenceName, supervisorIdentity } = req.body || {};
    if (!conferenceName || !supervisorIdentity) {
      return res.status(400).json({ error: 'missing fields' });
    }
    const conf = await waitForConferenceByName(conferenceName);
    const to = supervisorIdentity.startsWith('client:') ? supervisorIdentity : `client:${supervisorIdentity}`;

    const participant = await rest.conferences(conf.sid).participants.create({
      to,
      from: env.callerId,
      earlyMedia: true,
      coaching: false
    });

    pushEvent('SUPERVISE_BARGE', { conferenceSid: conf.sid, supervisorIdentity });
    res.json({ ok: true, participantSid: participant.callSid });
  } catch (e) {
    console.error('[SUPERVISE/BARGE] error', e);
    res.status(500).json({ error: 'cannot create barge participant', details: e?.message });
  }
});