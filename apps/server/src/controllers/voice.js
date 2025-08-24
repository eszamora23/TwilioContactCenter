// contact-center/server/src/controllers/voice.js
import { buildOutboundTwiml } from '../services/voice.js';

/**
 * TwiML para salientes desde la TwiML App.
 * Acepta To (destino) y callerId/ANI opcional para sobrescribir el callerId por defecto.
 * (Twilio sólo acepta callerId si es un número Twilio tuyo o un Verified Caller ID).
 */
export function outbound(req, res) {
  const to = (req.body.To || '').trim();
  const callerId = (req.body.callerId || req.body.ANI || '').trim(); // llega desde Device.connect params
  const twiml = buildOutboundTwiml(to, callerId);
  return res.type('text/xml').status(200).send(twiml);
}
