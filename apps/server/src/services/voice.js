import Twilio from 'twilio';
import { serverEnv as env } from '@shared/env';

export function buildOutboundTwiml(to) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const dial = twiml.dial({ callerId: env.callerId });
  if (to.startsWith('client:')) {
    dial.client({}, to.replace('client:', ''));
  } else {
    dial.number({}, to);
  }
  return twiml.toString();
}

export function missingDestinationTwiml() {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say('Missing destination.');
  return twiml.toString();
}
