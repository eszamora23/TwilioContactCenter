import express from 'express';
import crypto from 'crypto';
import { requireAuth } from 'shared/auth';
import { createConversationsToken } from '../conversations/tokens.js';

const router = express.Router();

/** Normaliza identidad para Conversations (sin prefijo "client:"). */
function normalizeIdentity(raw) {
  if (!raw) return '';
  return raw.startsWith('client:') ? raw.slice('client:'.length) : raw;
}

/**
 * ===============================
 *   TOKENS PARA AGENTE (AUTH)
 * ===============================
 * Estos endpoints requieren sesión (cookies/JWT) y devuelven un token con
 * identidad del agente (p.ej. "agent:42"). Úsalos desde el Agent Desktop.
 */

/** Token para agente (1h). Requiere haber hecho login /auth/login. */
router.get('/token', requireAuth, (req, res) => {
  try {
    const raw = req.claims?.identity || '';
    const identity = normalizeIdentity(raw);
    if (!identity) return res.status(400).json({ error: 'invalid identity' });
    const token = createConversationsToken(identity, 3600);
    return res.json({ token, identity });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Refresh del token del agente. Acepta ?identity= opcional; por defecto usa la del JWT. */
router.get('/refresh', requireAuth, (req, res) => {
  try {
    const raw = String(req.query.identity || req.claims?.identity || '').trim();
    const identity = normalizeIdentity(raw);
    if (!identity) return res.status(400).json({ error: 'identity is required' });
    const token = createConversationsToken(identity, 3600);
    return res.json({ token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * =================================
 *   TOKENS PARA INVITADO (PÚBLICO)
 * =================================
 * Úsalos ÚNICAMENTE desde tu “webchat” público/embebido (no autenticado).
 * El cliente DEBE persistir la identidad devuelta para hacer refresh luego.
 */

/** Token guest (1h). */
router.get('/token/guest', (_req, res) => {
  try {
    const identity = `guest:${crypto.randomUUID()}`;
    const token = createConversationsToken(identity, 3600);
    return res.json({ token, identity });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Refresh guest. Requiere ?identity=guest:... */
router.get('/refresh/guest', (req, res) => {
  const identity = String(req.query.identity || '').trim();
  if (!identity) return res.status(400).json({ error: 'identity is required' });
  if (identity.startsWith('client:')) {
    return res.status(400).json({ error: 'pass identity without "client:" prefix' });
  }
  try {
    const token = createConversationsToken(identity, 3600);
    return res.json({ token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
