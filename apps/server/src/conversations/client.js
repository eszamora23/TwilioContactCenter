import twilio from 'twilio';


const {
TWILIO_ACCOUNT_SID,
TWILIO_AUTH_TOKEN,
TWILIO_REGION, // optional e.g. 'au1'
TWILIO_EDGE, // optional e.g. 'sydney'
} = process.env;


if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
throw new Error('Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN');
}


/**
* Twilio client with sensible defaults
*/
export const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, {
autoRetry: true,
maxRetries: 3,
keepAlive: true,
region: TWILIO_REGION || undefined,
edge: TWILIO_EDGE || undefined,
});