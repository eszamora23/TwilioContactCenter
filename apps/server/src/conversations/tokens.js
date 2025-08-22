import twilio from 'twilio';


const { AccessToken } = twilio.jwt;
const { ChatGrant } = AccessToken; // Conversations uses ChatGrant with serviceSid


const {
TWILIO_ACCOUNT_SID,
TWILIO_API_KEY_SID,
TWILIO_API_KEY_SECRET,
TWILIO_CONVERSATIONS_SERVICE_SID, // ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
} = process.env;


if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_CONVERSATIONS_SERVICE_SID) {
console.warn('[Conversations] Missing token envs; /api/chat/token will fail without them');
}


export function createConversationsToken(identity, ttlSeconds = 3600) {
if (!identity) throw new Error('identity is required');
const token = new AccessToken(
TWILIO_ACCOUNT_SID,
TWILIO_API_KEY_SID,
TWILIO_API_KEY_SECRET,
{ identity, ttl: ttlSeconds }
);
token.addGrant(new ChatGrant({ serviceSid: TWILIO_CONVERSATIONS_SERVICE_SID }));
return token.toJwt();
}