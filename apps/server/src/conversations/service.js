import { twilioClient as client } from './client.js';

const {
  TWILIO_MESSAGING_SERVICE_SID,
  TWILIO_SMS_NUMBER,
  TWILIO_WHATSAPP_NUMBER,
  TWILIO_MESSENGER_PAGE_ID,
  TWILIO_CONVERSATIONS_SERVICE_SID,
} = process.env;

if (!TWILIO_CONVERSATIONS_SERVICE_SID) {
  console.warn('[Conversations] TWILIO_CONVERSATIONS_SERVICE_SID is not configured');
}

const service = TWILIO_CONVERSATIONS_SERVICE_SID
  ? client.conversations.v1.services(TWILIO_CONVERSATIONS_SERVICE_SID)
  : null;

function requireService() {
  if (!service) {
    throw new Error('TWILIO_CONVERSATIONS_SERVICE_SID is required to use Conversations APIs');
  }
}

export async function getOrCreateConversation({ uniqueName, friendlyName, attributes = {} }) {
  requireService();
  if (!uniqueName) throw new Error('uniqueName required');
  try {
    return await service.conversations(uniqueName).fetch();
  } catch (err) {
    if (err.status !== 404) throw err;
    const convo = await service.conversations.create({
      uniqueName,
      friendlyName: friendlyName || uniqueName,
      attributes: JSON.stringify({ ...attributes, taskSid: null }),
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID || undefined,
    });
    return service.conversations(convo.sid).update({
      'timers.inactive': 'PT15M',
      'timers.closed': 'P1D',
    });
  }
}

export async function addChatParticipant(conversationSid, { identity, attributes } = {}) {
  requireService();
  if (!identity) throw new Error('identity required');
  try {
    return await service
      .conversations(conversationSid)
      .participants.create({
        identity,
        attributes: attributes ? JSON.stringify(attributes) : undefined,
      });
  } catch (err) {
    if (err.status === 409 || err.code === 50433) {
      try {
        const existing = await service
          .conversations(conversationSid)
          .participants
          .list({ limit: 50 });
        const found = existing.find(p => p.identity === identity);
        if (found) return found;
        throw new Error('Participant already exists but could not be located via list()');
      } catch (fetchErr) {
        throw new Error(
          `Participant already exists but could not be fetched: ${fetchErr.message}`
        );
      }
    }
    throw new Error(
      `Failed to add participant ${identity} to conversation ${conversationSid}: ${err.message}`
    );
  }
}

export function addSmsParticipant(conversationSid, { to, from }) {
  requireService();
  const proxy = from || TWILIO_SMS_NUMBER;
  if (!to || !proxy) throw new Error('to and from (or TWILIO_SMS_NUMBER) are required');
  return service.conversations(conversationSid).participants.create({
    'messagingBinding.address': to,
    'messagingBinding.proxyAddress': proxy
  });
}

export function addWhatsappParticipant(conversationSid, { to, from }) {
  requireService();
  const proxy = from || TWILIO_WHATSAPP_NUMBER;
  if (!to || !proxy) throw new Error('to and from (or TWILIO_WHATSAPP_NUMBER) are required');
  return service.conversations(conversationSid).participants.create({
    'messagingBinding.address': `whatsapp:${to}`,
    'messagingBinding.proxyAddress': `whatsapp:${proxy}`,
  });
}

export function addMessengerParticipant(conversationSid, { userId, pageId }) {
  requireService();
  const proxy = pageId || TWILIO_MESSENGER_PAGE_ID;
  if (!userId || !proxy) throw new Error('userId and pageId (or TWILIO_MESSENGER_PAGE_ID) are required');
  return service.conversations(conversationSid).participants.create({
    'messagingBinding.address': `messenger:${userId}`,
    'messagingBinding.proxyAddress': `messenger:${proxy}`,
  });
}

export function sendMessage(conversationSid, { author = 'system', body, mediaSid, attributes }) {
  requireService();
  const payload = { author };
  if (body) payload.body = body;
  if (mediaSid) payload.mediaSid = mediaSid;
  if (attributes) payload.attributes = JSON.stringify(attributes);
  const webhookHeader = { xTwilioWebhookEnabled: 'true' };
  return service.conversations(conversationSid).messages.create(payload, webhookHeader);
}

export function attachWebhook(conversationSid, { target = 'webhook', url, method = 'post', filters = ['onMessageAdded'], flowSid }) {
  requireService();
  const cfg = {};
  if (target === 'webhook') {
    if (!url) throw new Error('url is required when target=webhook');
    cfg['configuration.url'] = url;
    cfg['configuration.method'] = method;
    cfg['configuration.filters'] = filters;
  } else if (target === 'studio') {
    if (!flowSid) throw new Error('flowSid is required when target=studio');
    cfg['configuration.flowSid'] = flowSid;
  }
  return service.conversations(conversationSid).webhooks.create({ target, ...cfg });
}

export const fetchConversation = (sid) => {
  requireService();
  return service.conversations(sid).fetch();
};

export async function updateConversationAttributes(conversationSid, newAttributes = {}) {
  requireService();
  const convo = await fetchConversation(conversationSid);
  const current =
    typeof convo.attributes === 'string'
      ? (convo.attributes ? JSON.parse(convo.attributes) : {})
      : (convo.attributes || {});
  const merged = { ...current, ...newAttributes };
  return service.conversations(conversationSid).update({
    attributes: JSON.stringify(merged),
  });
}

export function listMessageReceipts(conversationSid, messageSid) {
  requireService();
  if (!conversationSid || !messageSid) {
    throw new Error('conversationSid and messageSid are required');
  }
  return service
    .conversations(conversationSid)
    .messages(messageSid)
    .deliveryReceipts.list();
}

export function updateConversationTimers(conversationSid, { inactive, closed } = {}) {
  requireService();
  const payload = {};
  if (inactive) payload['timers.inactive'] = inactive;
  if (closed) payload['timers.closed'] = closed;
  return service.conversations(conversationSid).update(payload);
}

/* ===== NUEVO: helpers para cierre “duro” ===== */

export function listParticipants(conversationSid) {
  requireService();
  return service.conversations(conversationSid).participants.list({ limit: 200 });
}

export async function removeAllParticipants(conversationSid) {
  requireService();
  const parts = await listParticipants(conversationSid);
  let removed = 0;
  for (const p of parts) {
    try {
      await service.conversations(conversationSid).participants(p.sid).remove();
      removed++;
    } catch (e) {
      console.warn('[Conversations] remove participant failed', p.sid, e?.message || e);
    }
  }
  return { removed, total: parts.length };
}

export async function closeConversation(conversationSid, { removeParticipants = true } = {}) {
  requireService();
  await service.conversations(conversationSid).update({
    'timers.inactive': 'PT0S',
    'timers.closed': 'PT0S',
  });
  if (removeParticipants) {
    await removeAllParticipants(conversationSid);
  }
  try {
    const convo = await fetchConversation(conversationSid);
    return { ok: true, state: convo.state || convo.status || 'unknown' };
  } catch {
    return { ok: true };
  }
}

export function configureServiceWebhooks({
  preWebhookUrl,
  postWebhookUrl,
  method = 'POST',
  filters = ['onMessageAdd', 'onConversationAdd'],
} = {}) {
  if (!service) {
    console.warn('[Conversations] Skipping service webhook configuration: TWILIO_CONVERSATIONS_SERVICE_SID is not set');
    return Promise.resolve();
  }

  const payload = {};
  if (preWebhookUrl) payload.preWebhookUrl = preWebhookUrl;
  if (postWebhookUrl) payload.postWebhookUrl = postWebhookUrl;
  if (filters) payload.filters = filters;
  if (method) payload.method = method;

  if (Object.keys(payload).length === 0) return Promise.resolve();

  return service.configuration.webhooks().update(payload);
}
