import { rest } from '../twilio.js';
import { serverEnv as env } from '@shared/env';
import { pushEvent } from './taskrouter.js';

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

async function getConferenceFromTask(taskSid) {
  const task = await rest.taskrouter.v1
    .workspaces(env.workspaceSid)
    .tasks(taskSid)
    .fetch();
  let attrs = {};
  try { attrs = JSON.parse(task.attributes || '{}'); } catch {}
  const confSid = attrs?.conference?.sid || attrs?.conference?.conference_sid || null;
  const customerCallSid = attrs?.conference?.participants?.customer || attrs?.customer?.callSid || attrs?.callSid || null;
  const workerCallSid = attrs?.conference?.participants?.worker || attrs?.conference?.participants?.agent || attrs?.worker?.callSid || null;
  if (!confSid) return null;
  return { confSid, customerCallSid, workerCallSid };
}

async function ensureConferenceReadyByName({ confName, customerCallSid, agentCallSid }) {
  const twimlCust = conferenceTwiml(confName, { endOnExit: true, beep: false });
  const twimlAgnt = conferenceTwiml(confName, { endOnExit: false, beep: false });
  try { await rest.calls(customerCallSid).update({ twiml: twimlCust }); } catch {}
  try { await rest.calls(agentCallSid).update({ twiml: twimlAgnt }); } catch {}
  return await waitForConferenceByName(confName);
}

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

const holdMap = new Map();

export async function holdStart({ taskSid, customerCallSid, agentCallSid, who = 'customer' }) {
  let confSid, targetCallSid;
  if (!customerCallSid || !agentCallSid) {
    throw new Error('missing callSids');
  }
  if (taskSid) {
    const info = await getConferenceFromTask(taskSid);
    if (info?.confSid) {
      confSid = info.confSid;
      targetCallSid = (who === 'agent') ? (info.workerCallSid || agentCallSid) : (info.customerCallSid || customerCallSid);
      await waitForConferenceBySid(confSid);
    } else {
      const conf = await waitForConferenceByName(taskSid);
      confSid = conf.sid;
      targetCallSid = (who === 'agent') ? agentCallSid : customerCallSid;
    }
  } else {
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
  holdMap.set(targetCallSid, Date.now());
  pushEvent('HOLD_START', { confSid, target: who });
  return { ok: true, confSid, who };
}

export async function holdStop({ taskSid, customerCallSid, agentCallSid, who = 'customer' }) {
  let confSid, targetCallSid;
  if (!customerCallSid || !agentCallSid) {
    throw new Error('missing callSids');
  }
  if (taskSid) {
    const info = await getConferenceFromTask(taskSid);
    if (info?.confSid) {
      confSid = info.confSid;
      targetCallSid = (who === 'agent') ? (info.workerCallSid || agentCallSid) : (info.customerCallSid || customerCallSid);
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
  const holdStart = holdMap.get(targetCallSid);
  if (holdStart) {
    const duration = Math.floor((Date.now() - holdStart) / 1000);
    holdMap.delete(targetCallSid);
    console.log(`Hold duration for ${targetCallSid}: ${duration}s`);
  }
  pushEvent('HOLD_STOP', { confSid, target: who });
  return { ok: true, confSid, who };
}

async function latestRecordingForCall(callSid) {
  const recs = await rest.calls(callSid).recordings.list({ limit: 20 });
  if (!recs || !recs.length) return null;
  return recs.find((r) => r.status === 'in-progress') || recs.find((r) => r.status === 'paused') || recs[0];
}

export async function recordingStatus(callSid) {
  const rec = await latestRecordingForCall(callSid);
  const status = rec ? rec.status : 'inactive';
  return { status };
}

export async function recordingStart(callSid) {
  const rec = await rest.calls(callSid).recordings.create({});
  pushEvent('REC_START', { callSid, recordingSid: rec.sid });
  return { ok: true, recordingSid: rec.sid };
}

export async function recordingPause(callSid) {
  const rec = await latestRecordingForCall(callSid);
  if (!rec) throw new Error('no recording found');
  await rest.calls(callSid).recordings(rec.sid).update({ status: 'paused', pauseBehavior: 'silence' });
  pushEvent('REC_PAUSE', { callSid, recordingSid: rec.sid });
  return { ok: true, recordingSid: rec.sid };
}

export async function recordingResume(callSid) {
  const rec = await latestRecordingForCall(callSid);
  if (!rec) throw new Error('no recording found');
  await rest.calls(callSid).recordings(rec.sid).update({ status: 'in-progress' });
  pushEvent('REC_RESUME', { callSid, recordingSid: rec.sid });
  return { ok: true, recordingSid: rec.sid };
}

export async function recordingStop(callSid) {
  const rec = await latestRecordingForCall(callSid);
  if (!rec) throw new Error('no recording found');
  await rest.calls(callSid).recordings(rec.sid).update({ status: 'stopped' });
  pushEvent('REC_STOP', { callSid, recordingSid: rec.sid });
  return { ok: true, recordingSid: rec.sid };
}

export async function superviseWhisper({ conferenceName, supervisorIdentity, coachCallSid }) {
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
  return { ok: true, participantSid: participant.callSid };
}

export async function superviseBarge({ conferenceName, supervisorIdentity }) {
  const conf = await waitForConferenceByName(conferenceName);
  const to = supervisorIdentity.startsWith('client:') ? supervisorIdentity : `client:${supervisorIdentity}`;
  const participant = await rest.conferences(conf.sid).participants.create({
    to,
    from: env.callerId,
    earlyMedia: true,
    coaching: false
  });
  pushEvent('SUPERVISE_BARGE', { conferenceSid: conf.sid, supervisorIdentity });
  return { ok: true, participantSid: participant.callSid };
}
