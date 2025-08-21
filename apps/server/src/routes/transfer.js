// contact-center/server/src/routes/transfer.js
import { Router } from 'express';
import { requireAuth } from '@shared/auth';
import { serverEnv as env } from '@shared/env';
import { rest } from '../twilio.js';

export const transfer = Router();

/**
 * Escapa mínimo para TwiML embebido
 */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/**
 * Genera TwiML de conferencia
 * - endConferenceOnExit: true para el cliente (si cuelga, termina conf)
 */
function conferenceTwiml(name, { endOnExit = false, beep = false } = {}) {
  return `
<Response>
  <Dial callerId="${esc(env.callerId)}">
    <Conference beep="${beep ? 'true' : 'false'}"
                endConferenceOnExit="${endOnExit ? 'true' : 'false'}">${esc(name)}</Conference>
  </Dial>
</Response>`.trim();
}

/**
 * Normaliza el destino a formato client:<identity-sin-prefix>
 * Acepta:
 *  - "client:agent:42"  -> client:agent:42
 *  - "agent:42"         -> client:agent:42
 *  - "42"               -> client:agent:42
 */
function normalizeTargetIdentity(targetIdentity) {
  const raw = String(targetIdentity || '').trim();
  if (!raw) return '';
  if (raw.startsWith('client:')) return raw;               // ya ok
  if (raw.startsWith('agent:'))  return `client:${raw}`;   // anteponer client:
  return `client:agent:${raw}`;
}

/**
 * Espera a que un CallSid esté en estado in-progress, con reintentos cortos.
 * Lanza error si el estado ya es terminal o no alcanza in-progress en el tiempo dado.
 */
async function waitUntilInProgress(callSid, { tries = 8, delayMs = 250 } = {}) {
  for (let i = 0; i < tries; i++) {
    const c = await rest.calls(callSid).fetch();
    // estados de Twilio: queued | ringing | in-progress | completed | busy | failed | no-answer | canceled
    if (c.status === 'in-progress') return c;

    // si ya está en un estado imposible para redirección, fallar temprano
    if (['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(c.status)) {
      const err = new Error(`Call ${callSid} is ${c.status}, cannot redirect`);
      err.code = 'NOT_REDIRECTABLE';
      err.twilioStatus = c.status;
      throw err;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const c = await rest.calls(callSid).fetch();
  const err = new Error(`Call ${callSid} still ${c.status}, not in-progress`);
  err.code = 'NOT_IN_PROGRESS';
  err.twilioStatus = c.status;
  throw err;
}

/**
 * POST /api/transfer/cold
 * body: { customerCallSid, targetIdentity, agentCallSid? }
 * - Redirige el leg del cliente para marcar al agente destino
 * - (Opcional) cuelga el leg del agente actual
 */
transfer.post('/transfer/cold', requireAuth, async (req, res) => {
  try {
    const { customerCallSid, targetIdentity, agentCallSid } = req.body || {};
    if (!customerCallSid || !targetIdentity) {
      return res.status(400).json({ error: 'missing customerCallSid or targetIdentity' });
    }

    const toClient = normalizeTargetIdentity(targetIdentity);
    if (!toClient) return res.status(400).json({ error: 'invalid targetIdentity' });

    // Asegurar que el leg del cliente esté realmente en progreso
    try {
      await waitUntilInProgress(customerCallSid);
    } catch (e) {
      const status = e.code === 'NOT_REDIRECTABLE' ? 409 : 409;
      return res.status(status).json({
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

    await rest.calls(customerCallSid).update({ twiml });

    // Si se especifica el leg del agente, lo colgamos (corte frío)
    if (agentCallSid) {
      try {
        await rest.calls(agentCallSid).update({ status: 'completed' });
      } catch { /* noop */ }
    }

    return res.json({ ok: true, mode: 'cold' });
  } catch (e) {
    console.error('[TRANSFER/COLD] error', e);
    return res.status(500).json({ error: 'cold transfer failed' });
  }
});

/**
 * POST /api/transfer/warm
 * body: { taskSid?, customerCallSid, agentCallSid, targetIdentity }
 * - Mueve cliente y agente a una Conference
 * - Llama al agente destino para que se una
 * - Luego el front puede llamar a /transfer/complete con agentCallSid
 */
transfer.post('/transfer/warm', requireAuth, async (req, res) => {
  try {
    const { taskSid, customerCallSid, agentCallSid, targetIdentity } = req.body || {};
    if (!customerCallSid || !agentCallSid || !targetIdentity) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    const toClient = normalizeTargetIdentity(targetIdentity);
    if (!toClient) return res.status(400).json({ error: 'invalid targetIdentity' });

    // Confirmar que ambos legs estén in-progress antes de redirigir
    try {
      await waitUntilInProgress(customerCallSid); // leg del cliente
      await waitUntilInProgress(agentCallSid);    // leg del agente actual
    } catch (e) {
      return res.status(409).json({
        error: 'call not in-progress',
        details: e.message,
        twilioStatus: e.twilioStatus || undefined
      });
    }

    const confName = taskSid ? `task-${taskSid}` : `xfer-${customerCallSid}`;

    // 1) mover al cliente a conf (si cuelga el cliente, termina la conf)
    const twimlCustomer = conferenceTwiml(confName, { endOnExit: true, beep: false });
    await rest.calls(customerCallSid).update({ twiml: twimlCustomer });

    // 2) mover al agente actual a conf (no termina conf si cuelga este agente)
    const twimlAgent = conferenceTwiml(confName, { endOnExit: false, beep: false });
    await rest.calls(agentCallSid).update({ twiml: twimlAgent });

    // 3) invitar al agente destino (beep para que escuche el join)
    const twimlTarget = conferenceTwiml(confName, { endOnExit: false, beep: true });
    await rest.calls.create({
      to: toClient,                        // ya viene en formato client:...
      from: env.callerId,
      twiml: twimlTarget
    });

    return res.json({ ok: true, mode: 'warm', conference: confName });
  } catch (e) {
    console.error('[TRANSFER/WARM] error', e);
    return res.status(500).json({ error: 'warm transfer failed' });
  }
});

/**
 * POST /api/transfer/complete
 * body: { agentCallSid }
 * - Completa la transferencia warm: cuelga al agente que inició la transferencia.
 */
transfer.post('/transfer/complete', requireAuth, async (req, res) => {
  try {
    const { agentCallSid } = req.body || {};
    if (!agentCallSid) return res.status(400).json({ error: 'missing agentCallSid' });

    await rest.calls(agentCallSid).update({ status: 'completed' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[TRANSFER/COMPLETE] error', e);
    return res.status(500).json({ error: 'complete transfer failed' });
  }
});
