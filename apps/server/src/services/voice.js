import Twilio from 'twilio';
import { serverEnv as env } from '@shared/env';

export function buildOutboundTwiml(to) {
  const twiml = new Twilio.twiml.VoiceResponse();
  if (!to) {
    twiml.say('Missing destination.');
    return twiml.toString();
  }
  const dial = twiml.dial({ callerId: env.callerId });
  if (to.startsWith('client:')) {
    dial.client({}, to.replace('client:', ''));
  } else {
    dial.number({}, to);
  }
  return twiml.toString();
}
