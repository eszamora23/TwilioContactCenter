// server/demo-routes.js
import express from 'express';
import twilio from 'twilio';
import { serverEnv as env } from 'shared/env';
import { buildVoiceToken } from '../twilio.js';

const router = express.Router();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
} = process.env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Único destino permitido por ahora (IVR del demo)
const ALLOWED_TO = new Set(['+12058275832']);

/**
 * ✅ Token de Voice (público para el demo)
 * Requiere en el .env:
 *  - TWILIO_ACCOUNT_SID
 *  - TWILIO_API_KEY_SID
 *  - TWILIO_API_KEY_SECRET
 *  - TWIML_APP_SID          (muy importante para salientes)
 *
 * Nota: buildVoiceToken añade VoiceGrant con outgoingApplicationSid=TWIML_APP_SID.
 */
router.get('/token/voice', (req, res) => {
  try {
    const identity = String(req.query.identity || 'softphone:alex').trim();

    const missing = [];
    if (!env.accountSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!env.apiKey)     missing.push('TWILIO_API_KEY_SID');
    if (!env.apiSecret)  missing.push('TWILIO_API_KEY_SECRET');
    if (!env.twimlAppSid) missing.push('TWIML_APP_SID'); // necesario para device.connect() → /api/voice/outbound

    if (missing.length) {
      return res.status(500).json({
        error: 'missing env',
        missing
      });
    }

    const token = buildVoiceToken(identity);
    return res.json({ token, identity });
  } catch (e) {
    console.error('[demo/token/voice] error', e);
    return res.status(500).json({ error: e?.message || 'token failed' });
  }
});

/**
 * ☎️ Fallback REST: inicia llamada desde el servidor (sin WebRTC en el browser).
 * Queda para demo; el UI usa WebRTC primero y cae aquí si falla la inicialización.
 */
router.post('/call/start', async (req, res) => {
  try {
    const { to, from, dtmf } = req.body || {};

    if (!to || !from) return res.status(400).json({ error: 'Missing to/from' });
    if (!ALLOWED_TO.has(to)) return res.status(400).json({ error: 'TO not allowed for demo' });

    // "1-2-1" → "1w2w1" (w = 0.5s)
    const digits = String(dtmf || '')
      .trim()
      .replace(/[^\d\-w]/g, '')
      .replace(/-+/g, 'w');

    const vr = new twilio.twiml.VoiceResponse();
    if (digits) {
      vr.pause({ length: 1 });
      vr.play({ digits });
    }
    // Mantener “viva” la llamada hasta 10 min para navegar el IVR si hiciera falta:
    vr.pause({ length: 600 });

    const call = await client.calls.create({
      to,
      from,
      twiml: vr.toString(),
      // statusCallback: `${env.publicBaseUrl}/demo/call/status`,
      // statusCallbackEvent: ['initiated','ringing','answered','completed'],
    });

    return res.json({ ok: true, sid: call.sid });
  } catch (err) {
    console.error('[demo/call/start] error', err);
    return res.status(500).json({ error: err.message || 'call failed' });
  }
});

export default router;
