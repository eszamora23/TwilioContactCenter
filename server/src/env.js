import 'dotenv/config';

export const env = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  apiKey: process.env.TWILIO_API_KEY_SID,
  apiSecret: process.env.TWILIO_API_KEY_SECRET,

  workspaceSid: process.env.TR_WORKSPACE_SID,
  workflowSid: process.env.TR_WORKFLOW_SID,
  wrapActivitySid: process.env.TR_WRAP_ACTIVITY_SID,

  twimlAppSid: process.env.TWIML_APP_SID,
  callerId: process.env.VOICE_CALLER_ID,

  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  skipTwilioValidation: String(process.env.SKIP_TWILIO_VALIDATION || 'false') === 'true',

  mongoUri: process.env.MONGODB_URI,

  // WOW / Voice
  holdMusicUrl: process.env.HOLD_MUSIC_URL || 'https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
  slaSeconds: Number(process.env.SLA_SECONDS || 45),
  breakActivitySid: process.env.TR_BREAK_ACTIVITY_SID || '',

  // CRM Orchestrator
  crmOrchBaseUrl: process.env.CRM_ORCH_BASE_URL || 'http://localhost:4100',
  crmOrchAudience: process.env.CRM_ORCH_JWT_AUD || 'crm-orchestrator',
  crmOrchIssuer: process.env.CRM_ORCH_JWT_ISS || 'server',
  crmOrchKey: process.env.CRM_ORCH_JWT_KEY || 'crm-orch-demo-key'
};
