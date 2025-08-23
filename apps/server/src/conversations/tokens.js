import twilio from 'twilio';

const { AccessToken } = twilio.jwt;
const { ChatGrant, SyncGrant } = AccessToken;

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_CONVERSATIONS_SERVICE_SID, // IS... (Conversations)
  TWILIO_SYNC_SERVICE_SID,          // IS... (Sync)  <-- opcional, distinto del de arriba
} = process.env;

export function createConversationsToken(identity, ttlSeconds = 3600) {
  if (!identity) throw new Error('identity is required');

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    { identity, ttl: ttlSeconds }
  );

  // Requerido para Conversations
  token.addGrant(new ChatGrant({ serviceSid: TWILIO_CONVERSATIONS_SERVICE_SID }));

  // Opcional: SOLO si realmente usas Sync y tienes el IS correcto de Sync
  if (TWILIO_SYNC_SERVICE_SID) {
    token.addGrant(new SyncGrant({ serviceSid: TWILIO_SYNC_SERVICE_SID }));
  }
  // Nota: NO hagas `new SyncGrant()` sin serviceSid.

  return token.toJwt();
}
