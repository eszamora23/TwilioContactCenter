import crypto from 'crypto';
import { signAgentToken } from 'shared/auth';
import { serverEnv as env } from 'shared/env';
import { fetchWorker, createVoiceToken, createWorkerToken } from '../services/tokens.js';

const refreshTokens = new Map();

const accessCookieOpts = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'strict',
  domain: env.cookieDomain,
  maxAge: 8 * 60 * 60 * 1000,
};

const refreshCookieOpts = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'strict',
  domain: env.cookieDomain,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function getCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return undefined;
  return raw
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${name}=`))
    ?.split('=')[1];
}

function toContactUri(raw) {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (val.startsWith('client:')) return val;
  if (val.startsWith('agent:')) return `client:${val}`;
  return `client:agent:${val}`;
}

export async function login(req, res) {
  const { agentId, workerSid, identity } = req.body;
  if (!agentId || !workerSid || identity == null) {
    return res.status(400).json({ error: 'missing fields' });
  }
  try {
    const worker = await fetchWorker(workerSid);
    const attrs = JSON.parse(worker.attributes || '{}');
    const normalized = toContactUri(identity);
    if (!attrs.contact_uri || attrs.contact_uri !== normalized) {
      return res.status(400).json({
        error: 'identity mismatch with worker.contact_uri',
        expected: normalized,
        got: attrs.contact_uri || null,
        hint: 'Verifica que el Worker tenga attributes.contact_uri igual al expected.'
      });
    }
    const access = signAgentToken(agentId, workerSid, normalized);
    const refresh = crypto.randomUUID();
    refreshTokens.set(refresh, { agentId, workerSid, identity: normalized });
    res.cookie(env.accessTokenName, access, accessCookieOpts);
    res.cookie(env.refreshTokenName, refresh, refreshCookieOpts);
    return res.json({
      agent: { id: agentId, workerSid, identity: normalized }
    });
  } catch (e) {
    console.error('[AUTH/LOGIN] Error fetching worker or TR config:', e?.message || e);
    return res.status(400).json({ error: 'invalid workerSid or TR config' });
  }
}

export function me(req, res) {
  const token = getCookie(req, env.refreshTokenName);
  if (!token || !refreshTokens.has(token)) {
    return res.status(401).json({ error: 'invalid refresh token' });
  }
  const { agentId, workerSid, identity } = refreshTokens.get(token);
  const access = signAgentToken(agentId, workerSid, identity);
  res.cookie(env.accessTokenName, access, accessCookieOpts);
  return res.json({ agent: { id: agentId, workerSid, identity } });
}

export function refresh(req, res) {
  const token = getCookie(req, env.refreshTokenName);
  if (!token || !refreshTokens.has(token)) {
    return res.status(401).json({ error: 'invalid refresh token' });
  }
  const { agentId, workerSid, identity } = refreshTokens.get(token);
  const access = signAgentToken(agentId, workerSid, identity);
  res.cookie(env.accessTokenName, access, accessCookieOpts);
  return res.json({ ok: true });
}

export function logout(req, res) {
  const token = getCookie(req, env.refreshTokenName);
  if (token) refreshTokens.delete(token);
  res.clearCookie(env.accessTokenName, { domain: env.cookieDomain });
  res.clearCookie(env.refreshTokenName, { domain: env.cookieDomain });
  res.status(204).end();
}

export function voiceToken(req, res) {
  try {
    const { identity } = req.claims;
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
    const token = createVoiceToken(identity);
    return res.json({ token });
  } catch (e) {
    console.error('[VOICE_TOKEN] Error building token:', e);
    return res.status(500).json({
      error: 'voice token build failed',
      details: e?.message || String(e)
    });
  }
}

export function workerToken(req, res) {
  const { workerSid } = req.claims;
  const missing = [];
  if (!env.accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!env.authToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!env.workspaceSid) missing.push('TR_WORKSPACE_SID');
  if (!workerSid) {
    return res.status(400).json({ error: 'missing workerSid in claims' });
  }
  if (missing.length) {
    console.error('[TR_WORKER_TOKEN] Missing ENV:', missing);
    return res.status(500).json({
      error: 'worker token build failed: missing env',
      missing
    });
  }
  try {
    const token = createWorkerToken(workerSid);
    return res.json({ token });
  } catch (e) {
    console.error('[TR_WORKER_TOKEN] Error building token:', e?.message || e);
    return res.status(500).json({ error: 'worker token build failed' });
  }
}

