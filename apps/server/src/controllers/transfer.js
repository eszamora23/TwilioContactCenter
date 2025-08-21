import * as transferService from '../services/transfer.js';

export async function cold(req, res) {
  try {
    const { customerCallSid, targetIdentity, agentCallSid } = req.body || {};
    if (!customerCallSid || !targetIdentity) {
      return res.status(400).json({ error: 'missing customerCallSid or targetIdentity' });
    }
    const result = await transferService.coldTransfer({ customerCallSid, targetIdentity, agentCallSid });
    return res.json(result);
  } catch (e) {
    console.error('[TRANSFER/COLD] error', e);
    const status = e.code === 'NOT_REDIRECTABLE' ? 409 : 500;
    return res.status(status).json({ error: 'cold transfer failed', details: e.message, twilioStatus: e.twilioStatus });
  }
}

export async function warm(req, res) {
  try {
    const { taskSid, customerCallSid, agentCallSid, targetIdentity } = req.body || {};
    if (!customerCallSid || !agentCallSid || !targetIdentity) {
      return res.status(400).json({ error: 'missing required fields' });
    }
    const result = await transferService.warmTransfer({ taskSid, customerCallSid, agentCallSid, targetIdentity });
    return res.json(result);
  } catch (e) {
    console.error('[TRANSFER/WARM] error', e);
    const status = e.code ? 409 : 500;
    return res.status(status).json({ error: 'warm transfer failed', details: e.message, twilioStatus: e.twilioStatus });
  }
}

export async function complete(req, res) {
  try {
    const { agentCallSid } = req.body || {};
    if (!agentCallSid) return res.status(400).json({ error: 'missing agentCallSid' });
    const result = await transferService.completeTransfer(agentCallSid);
    return res.json(result);
  } catch (e) {
    console.error('[TRANSFER/COMPLETE] error', e);
    return res.status(500).json({ error: 'complete transfer failed' });
  }
}
