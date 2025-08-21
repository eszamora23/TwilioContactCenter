import {  waitForConferenceByName,
  waitForConferenceBySid,
  waitForParticipantByCallSid,
  waitUntilParticipantConnected,
  getConferenceFromTask,
  ensureConferenceReadyByName,
  updateHold,
  latestRecordingForCall,
  createRecording,
  updateRecording,
  createParticipant,
  env
} from '../services/voiceControl.js';
import { pushEvent } from '../services/taskrouter.js';

const holdMap = new Map();

export async function holdStart(req, res) {
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
    res.json({ ok: true, confSid, who });
  } catch (e) {
    console.error('[HOLD/START] error', e);
    res.status(500).json({ error: 'cannot hold', details: e?.message });
  }
}

export async function holdStop(req, res) {
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
    const holdStart = holdMap.get(targetCallSid);
    if (holdStart) {
      const duration = Math.floor((Date.now() - holdStart) / 1000);
      holdMap.delete(targetCallSid);
      console.log(`Hold duration for ${targetCallSid}: ${duration}s`);
    }
    pushEvent('HOLD_STOP', { confSid, target: who });
    res.json({ ok: true, confSid, who });
  } catch (e) {
    console.error('[HOLD/STOP] error', e);
    res.status(500).json({ error: 'cannot unhold', details: e?.message });
  }
}

export async function recordingStatus(req, res) {
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
}

export async function recordingStart(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await createRecording(callSid);
    pushEvent('REC_START', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/START] error', e);
    res.status(500).json({ error: 'cannot start recording', details: e?.message });
  }
}

export async function recordingPause(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    await updateRecording(callSid, rec.sid, { status: 'paused', pauseBehavior: 'silence' });
    pushEvent('REC_PAUSE', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/PAUSE] error', e);
    res.status(500).json({ error: 'cannot pause recording', details: e?.message });
  }
}

export async function recordingResume(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    await updateRecording(callSid, rec.sid, { status: 'in-progress' });
    pushEvent('REC_RESUME', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/RESUME] error', e);
    res.status(500).json({ error: 'cannot resume recording', details: e?.message });
  }
}

export async function recordingStop(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    const rec = await latestRecordingForCall(callSid);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    await updateRecording(callSid, rec.sid, { status: 'stopped' });
    pushEvent('REC_STOP', { callSid, recordingSid: rec.sid });
    res.json({ ok: true, recordingSid: rec.sid });
  } catch (e) {
    console.error('[REC/STOP] error', e);
    res.status(500).json({ error: 'cannot stop recording', details: e?.message });
  }
}

export async function superviseWhisper(req, res) {
  try {
    const { conferenceName, supervisorIdentity, coachCallSid } = req.body || {};
    if (!conferenceName || !supervisorIdentity || !coachCallSid) {
      return res.status(400).json({ error: 'missing fields' });
    }
    const conf = await waitForConferenceByName(conferenceName);
    const to = supervisorIdentity.startsWith('client:') ? supervisorIdentity : `client:${supervisorIdentity}`;
    const participant = await createParticipant(conf.sid, {
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
}

export async function superviseBarge(req, res) {
  try {
    const { conferenceName, supervisorIdentity } = req.body || {};
    if (!conferenceName || !supervisorIdentity) {
      return res.status(400).json({ error: 'missing fields' });
    }
    const conf = await waitForConferenceByName(conferenceName);
    const to = supervisorIdentity.startsWith('client:') ? supervisorIdentity : `client:${supervisorIdentity}`;
    const participant = await createParticipant(conf.sid, {
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
}
