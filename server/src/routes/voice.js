import { Router } from 'express';
import Twilio from 'twilio';
import { env } from '../env.js';
import { verifyTwilioSignature } from '../middleware/verifyTwilio.js';

export const voice = Router();

voice.post('/voice/outbound', verifyTwilioSignature, (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const to = (req.body.To || '').trim();

  if (!to) {
    twiml.say('Missing destination.');
    return res.type('text/xml').status(200).send(twiml.toString());
  }

  const dial = twiml.dial({ callerId: env.callerId });
  if (to.startsWith('client:')) {
    dial.client({}, to.replace('client:', ''));
  } else {
    dial.number({}, to);
  }
  return res.type('text/xml').status(200).send(twiml.toString());
});
