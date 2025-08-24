// contact-center/server/src/twilio.js
import Twilio from 'twilio';
import { serverEnv as env } from 'shared/env';

/* ----------------------------- Helpers ENVs ----------------------------- */
function assertEnv(names, context = 'twilio.js') {
  const missing = names.filter((k) => !env[k]);
  if (missing.length) {
    const list = missing.join(', ');
    throw new Error(`[Twilio] Missing required env(s) for ${context}: ${list}`);
  }
}

/* ------------------------------- REST client ------------------------------- */
/**
 * Requeridos para REST:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 */
assertEnv(['accountSid', 'authToken'], 'REST client');
export const rest = Twilio(env.accountSid, env.authToken);

/* --------------------------- AccessToken (Voice/Video) --------------------------- */
const { AccessToken } = Twilio.jwt || {};
if (!AccessToken) {
  throw new Error('[Twilio] jwt.AccessToken not available (check twilio SDK version)');
}
const { VoiceGrant, VideoGrant } = AccessToken;

/* --------------------------- Voice AccessToken --------------------------- */
export function buildVoiceToken(identity) {
  if (!identity) throw new Error('[VoiceToken] missing identity');

  // ENVs críticos para Voice token
  assertEnv(['accountSid', 'apiKey', 'apiSecret'], 'Voice AccessToken');

  // IMPORTANTE: Voice identity NO debe incluir "client:".
  // Si llega "client:agent:42" en claims → usar "agent:42".
  const rawIdentity = String(identity);
  const identityForVoice = rawIdentity.startsWith('client:')
    ? rawIdentity.slice('client:'.length)
    : rawIdentity;

  const token = new AccessToken(
    env.accountSid,
    env.apiKey,
    env.apiSecret,
    { identity: identityForVoice, ttl: 3600 } // 1h
  );

  const grant = new VoiceGrant({
    outgoingApplicationSid: env.twimlAppSid || undefined,
    incomingAllow: true,
  });

  token.addGrant(grant);
  return token.toJwt();
}

/* --------------------- TaskRouter Worker Capability --------------------- */
const TR = (Twilio.jwt && Twilio.jwt.taskrouter) || {};
const TaskRouterCapability = TR.TaskRouterCapability || TR;
const Policy = (TaskRouterCapability && TaskRouterCapability.Policy) || TR.Policy;

if (!TaskRouterCapability) {
  throw new Error('[Twilio] TaskRouterCapability not available (check twilio SDK version)');
}
if (!Policy) {
  throw new Error('[Twilio] TaskRouter Policy class not available (check twilio SDK version)');
}

function buildPolicy({ url, method, allow }) {
  return new Policy({
    url,
    method,
    allow,
    queryFilter: {},
    postFilter: {},
  });
}

export function buildWorkerToken(workerSid) {
  if (!workerSid) throw new Error('[WorkerToken] missing workerSid');

  // ENVs críticos para Worker capability
  assertEnv(['workspaceSid', 'accountSid', 'authToken'], 'TaskRouter Worker Capability');

  const workspaceSid = env.workspaceSid;
  const accountSid = env.accountSid;
  const authToken = env.authToken;

  const capability = new TaskRouterCapability({
    accountSid,
    authToken,
    workspaceSid,
    channelId: workerSid,
  });

  // Base URLs
  const TR_BASE = 'https://taskrouter.twilio.com/v1';
  const EB_BASE = 'https://event-bridge.twilio.com/v1/wschannels';

  // Worker resources
  const workerUrl = `${TR_BASE}/Workspaces/${workspaceSid}/Workers/${workerSid}`;
  const workerSubresources = `${workerUrl}/**`;

  // Tasks (SDK lee Task y Reservations de esa Task) → evitar 403 Event Bridge
  const tasksUrlAll = `${TR_BASE}/Workspaces/${workspaceSid}/Tasks/**`;

  // Activities (para UI / estados)
  const activitiesUrl = `${TR_BASE}/Workspaces/${workspaceSid}/Activities`;
  const activitiesAllUrl = `${activitiesUrl}/**`;

  // Event Bridge channel + messages (GET/POST)
  const ebChannelUrl = `${EB_BASE}/${accountSid}/${workerSid}`;
  const ebMessagesUrl = `${ebChannelUrl}/messages`;

  const policies = [
    // Worker & subresources
    buildPolicy({ url: workerUrl, method: 'GET', allow: true }),
    buildPolicy({ url: workerSubresources, method: 'GET', allow: true }),
    buildPolicy({ url: workerUrl, method: 'POST', allow: true }),
    buildPolicy({ url: workerSubresources, method: 'POST', allow: true }),

    // Tasks (NECESARIO para que el SDK consulte Task/Reservations sin 403)
    buildPolicy({ url: tasksUrlAll, method: 'GET', allow: true }),
    buildPolicy({ url: tasksUrlAll, method: 'POST', allow: true }),

    // Activities (opcional pero útil para UI)
    buildPolicy({ url: activitiesUrl, method: 'GET', allow: true }),
    buildPolicy({ url: activitiesAllUrl, method: 'GET', allow: true }),

    // Event Bridge channel + messages (GET/POST)
    buildPolicy({ url: ebChannelUrl, method: 'GET', allow: true }),
    buildPolicy({ url: ebChannelUrl, method: 'POST', allow: true }),
    buildPolicy({ url: ebMessagesUrl, method: 'GET', allow: true }),
    buildPolicy({ url: ebMessagesUrl, method: 'POST', allow: true }),
  ];

  policies.forEach((p) => capability.addPolicy(p));

  // Generar JWT (SDKs antiguos usan generate(); modernos usan toJwt())
  if (typeof capability.generate === 'function') return capability.generate(3600); // 1h
  if (typeof capability.toJwt === 'function') return capability.toJwt();

  throw new Error('[TaskRouterCapability] neither generate() nor toJwt() available');
}

/* --------------------------- Video AccessToken --------------------------- */
export function buildVideoToken(identity, roomName) {
  if (!identity) throw new Error('[VideoToken] missing identity');
  assertEnv(['accountSid', 'apiKey', 'apiSecret'], 'Video AccessToken');

  // Igual que Voice: identidad sin "client:"
  const raw = String(identity);
  const clean = raw.startsWith('client:') ? raw.slice('client:'.length) : raw;

  const token = new AccessToken(
    env.accountSid,
    env.apiKey,
    env.apiSecret,
    { identity: clean, ttl: 3600 } // 1h
  );

  const grant = roomName ? new VideoGrant({ room: roomName }) : new VideoGrant();
  token.addGrant(grant);
  return token.toJwt();
}
