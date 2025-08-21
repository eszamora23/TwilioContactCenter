import * as tokenService from '../services/tokens.js';
import { serverEnv as env } from '@shared/env';

function toContactUri(raw) {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (val.startsWith('client:')) return val;
  if (val.startsWith('agent:')) return `client:${val}`;
  return `client:agent:${val}`;
}

export async function login(req, res) {
  const { agentId, workerSid, identity } = req.body || {};
  if (!agentId || !workerSid || identity == null) {
    return res.status(400).json({ error: 'missing fields' });
  }
  try {
    const normalized = toContactUri(identity);
    const result = await tokenService.login(agentId, workerSid, normalized);
    return res.json(result);
  } catch (e) {
    if (e.details) {
      return res.status(400).json({
        error: 'identity mismatch with worker.contact_uri',
        expected: e.details.expected,
        got: e.details.got,
        hint: 'Verifica que el Worker tenga attributes.contact_uri igual al expected.'
      });
    }
    console.error('[AUTH/LOGIN] Error fetching worker or TR config:', e?.message || e);
    return res.status(400).json({ error: 'invalid workerSid or TR config' });
  }
}

export async function voiceToken(req, res) {
  try {
    const { identity } = req.claims || {};
    if (!identity) {
      return res.status(400).json({ error: 'missing identity in claims' });
    }
    const missing = [];
    if (!env.accountSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!env.apiKey) missing.push('TWILIO_API_KEY_SID');
    if (!env.apiSecret) missing.push('TWILIO_API_KEY_SECRET');
    if (missing.length) {
      console.error('[VOICE_TOKEN] Missing ENV:', missing);
      return res.status(500).json({ error: 'voice token build failed: missing env', missing });
    }
    const result = tokenService.voiceToken(identity);
    return res.json(result);
  } catch (e) {
    console.error('[VOICE_TOKEN] Error building token:', e);
    return res.status(500).json({ error: 'voice token build failed', details: e?.message || String(e) });
  }
}

export async function workerToken(req, res) {
  const { workerSid } = req.claims || {};
  const missing = [];
  if (!env.accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!env.authToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!env.workspaceSid) missing.push('TR_WORKSPACE_SID');
  if (!workerSid) {
    return res.status(400).json({ error: 'missing workerSid in claims' });
  }
  if (missing.length) {
    console.error('[TR_WORKER_TOKEN] Missing ENV:', missing);
    return res.status(500).json({ error: 'worker token build failed: missing env', missing });
  }
  try {
    const result = tokenService.workerToken(workerSid);
    return res.json(result);
  } catch (e) {
    console.error('[TR_WORKER_TOKEN] Error building token:', e?.message || e);
    return res.status(500).json({ error: 'worker token build failed' });
  }
}
