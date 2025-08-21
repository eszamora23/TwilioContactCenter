import * as vcService from '../services/voiceControl.js';

export async function holdStart(req, res) {
  try {
    const { taskSid, customerCallSid, agentCallSid, who = 'customer' } = req.body || {};
    if (!customerCallSid || !agentCallSid) {
      return res.status(400).json({ error: 'missing callSids', need: ['customerCallSid','agentCallSid'] });
    }
    const result = await vcService.holdStart({ taskSid, customerCallSid, agentCallSid, who });
    res.json(result);
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
    const result = await vcService.holdStop({ taskSid, customerCallSid, agentCallSid, who });
    res.json(result);
  } catch (e) {
    console.error('[HOLD/STOP] error', e);
    res.status(500).json({ error: 'cannot unhold', details: e?.message });
  }
}

export async function recordingStatus(req, res) {
  try {
    const { callSid } = req.query || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    res.json(await vcService.recordingStatus(callSid));
  } catch (e) {
    console.error('[REC/STATUS] error', e);
    res.status(500).json({ error: 'cannot get recording status', details: e?.message });
  }
}

export async function recordingStart(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    res.json(await vcService.recordingStart(callSid));
  } catch (e) {
    console.error('[REC/START] error', e);
    res.status(500).json({ error: 'cannot start recording', details: e?.message });
  }
}

export async function recordingPause(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    res.json(await vcService.recordingPause(callSid));
  } catch (e) {
    console.error('[REC/PAUSE] error', e);
    const status = e.message === 'no recording found' ? 404 : 500;
    res.status(status).json({ error: 'cannot pause recording', details: e?.message });
  }
}

export async function recordingResume(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    res.json(await vcService.recordingResume(callSid));
  } catch (e) {
    console.error('[REC/RESUME] error', e);
    const status = e.message === 'no recording found' ? 404 : 500;
    res.status(status).json({ error: 'cannot resume recording', details: e?.message });
  }
}

export async function recordingStop(req, res) {
  try {
    const { callSid } = req.body || {};
    if (!callSid) return res.status(400).json({ error: 'missing callSid' });
    res.json(await vcService.recordingStop(callSid));
  } catch (e) {
    console.error('[REC/STOP] error', e);
    const status = e.message === 'no recording found' ? 404 : 500;
    res.status(status).json({ error: 'cannot stop recording', details: e?.message });
  }
}

export async function superviseWhisper(req, res) {
  try {
    const { conferenceName, supervisorIdentity, coachCallSid } = req.body || {};
    if (!conferenceName || !supervisorIdentity || !coachCallSid) {
      return res.status(400).json({ error: 'missing fields' });
    }
    res.json(await vcService.superviseWhisper({ conferenceName, supervisorIdentity, coachCallSid }));
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
    res.json(await vcService.superviseBarge({ conferenceName, supervisorIdentity }));
  } catch (e) {
    console.error('[SUPERVISE/BARGE] error', e);
    res.status(500).json({ error: 'cannot create barge participant', details: e?.message });
  }
}
