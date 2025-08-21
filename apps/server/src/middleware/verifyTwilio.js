import Twilio from 'twilio';
import { serverEnv as env } from 'shared/env';

export function verifyTwilioSignature(req, res, next) {
  if (env.skipTwilioValidation) return next();

  try {
    const signature = req.get('X-Twilio-Signature');
    if (!signature) return res.status(403).send('Missing Twilio signature');

    const base = env.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    const url = base + req.originalUrl;
    const params = req.body || {};

    const valid = Twilio.validateRequest(env.authToken, signature, url, params);
    if (!valid) return res.status(403).send('Invalid Twilio signature');

    return next();
  } catch {
    return res.status(403).send('Twilio validation error');
  }
}

