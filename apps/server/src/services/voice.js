// contact-center/server/src/services/voice.js
import Twilio from 'twilio';
import { serverEnv as env } from 'shared/env';

/**
 * Construye TwiML <Dial> hacia número o <Client>, permitiendo callerIdOverride.
 * Si callerIdOverride no es válido, Twilio usará el callerId por defecto (env.callerId).
 */
export function buildOutboundTwiml(to, callerIdOverride) {
  const twiml = new Twilio.twiml.VoiceResponse();
  if (!to) {
    twiml.say('Missing destination.');
    return twiml.toString();
  }

  const dial = twiml.dial({ callerId: (callerIdOverride || env.callerId) });

  if (to.startsWith('client:')) {
    dial.client({}, to.replace('client:', ''));
  } else {
    dial.number({}, to);
  }
  return twiml.toString();
}
