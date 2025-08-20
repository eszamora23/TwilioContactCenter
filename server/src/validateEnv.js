import { env } from './env.js';
export function validateEnv() {
  const required = [
    'accountSid','authToken','apiKey','apiSecret',
    'workspaceSid','workflowSid','wrapActivitySid',
    'callerId'
  ];
  const missing = required.filter(k => !env[k]);
  if (missing.length) {
    console.warn('[ENV WARNING] Missing:', missing.join(', '));
  }
}
