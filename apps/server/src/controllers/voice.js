import { buildOutboundTwiml, missingDestinationTwiml } from '../services/voice.js';

export function outbound(req, res) {
  const to = (req.body.To || '').trim();
  if (!to) {
    return res.type('text/xml').status(200).send(missingDestinationTwiml());
  }
  const twiml = buildOutboundTwiml(to);
  return res.type('text/xml').status(200).send(twiml);
}
