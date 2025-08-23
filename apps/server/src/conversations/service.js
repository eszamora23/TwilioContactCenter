import { twilioClient as client } from './client.js';


const {
  TWILIO_MESSAGING_SERVICE_SID, // optional MGxxxxxxxx for SMS/WhatsApp
  TWILIO_SMS_NUMBER, // optional +E.164
  TWILIO_WHATSAPP_NUMBER, // optional +E.164 (without whatsapp: prefix)
  TWILIO_MESSENGER_PAGE_ID, // optional FB Page ID for Messenger
  TWILIO_CONVERSATIONS_SERVICE_SID, // required ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
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


/**
* Create or fetch a Conversation by uniqueName. Prefer uniqueName as a stable key per case/ticket.
*/
export async function getOrCreateConversation({ uniqueName, friendlyName, attributes = {} }) {
  requireService();
  if (!uniqueName) throw new Error('uniqueName required');
  try {
    // Twilio REST allows SID or uniqueName in the path for fetch — we attempt fetch first.
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
      'timers.closed': 'P1D'
    });
  }
}


/** Add a WebChat participant via Conversations SDK identity */
export async function addChatParticipant(
  conversationSid,
  { identity, attributes } = {}
) {
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
        return await service
          .conversations(conversationSid)
          .participants(identity)
          .fetch();
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


/** Add an SMS participant using messagingBinding */
export function addSmsParticipant(conversationSid, { to, from }) {
  requireService();
  const proxy = from || TWILIO_SMS_NUMBER;
  if (!to || !proxy) throw new Error('to and from (or TWILIO_SMS_NUMBER) are required');
  return service.conversations(conversationSid).participants.create({
    'messagingBinding.address': to, // e.g. +15551234567
    'messagingBinding.proxyAddress': proxy, // your Twilio SMS number
  });
}


/** Add a WhatsApp participant using messagingBinding */
export function addWhatsappParticipant(conversationSid, { to, from }) {
  requireService();
  const proxy = from || TWILIO_WHATSAPP_NUMBER;
  if (!to || !proxy) throw new Error('to and from (or TWILIO_WHATSAPP_NUMBER) are required');
  return service.conversations(conversationSid).participants.create({
    'messagingBinding.address': `whatsapp:${to}`,
    'messagingBinding.proxyAddress': `whatsapp:${proxy}`,
  });
}


/** Add a Messenger participant (requires existing contact & Page) */
export function addMessengerParticipant(conversationSid, { userId, pageId }) {
  requireService();
  const proxy = pageId || TWILIO_MESSENGER_PAGE_ID;
  if (!userId || !proxy) throw new Error('userId and pageId (or TWILIO_MESSENGER_PAGE_ID) are required');
  return service.conversations(conversationSid).participants.create({
    'messagingBinding.address': `messenger:${userId}`,
    'messagingBinding.proxyAddress': `messenger:${proxy}`,
  });
}


/**
 * Send a message (works for all channels).
 *
 * The `xTwilioWebhookEnabled` option instructs Twilio to fire any configured
 * Conversation webhooks even though the message was sent via REST. Use this
 * header only when a webhook callback is desired after a REST send.
 */
export function sendMessage(
  conversationSid,
  { author = 'system', body, mediaSid, attributes }
) {
  requireService();
  const payload = { author };
  if (body) payload.body = body;
  if (mediaSid) payload.mediaSid = mediaSid;
  if (attributes) payload.attributes = JSON.stringify(attributes);
  return service
    .conversations(conversationSid)
    .messages.create(payload, { xTwilioWebhookEnabled: true });
}


/** Optional: attach a conversation‑scoped webhook (Studio/webhook/trigger) */
export function attachWebhook(conversationSid, { target = 'webhook', url, method = 'post', filters = ['onMessageAdded'], flowSid }) {
  requireService();
  const cfg = {};
  if (target === 'webhook') {
    cfg['configuration.url'] = url;
    cfg['configuration.method'] = method;
    cfg['configuration.filters'] = filters;
  } else if (target === 'studio') {
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
  const current = convo.attributes ? JSON.parse(convo.attributes) : {};
  const merged = { ...current, ...newAttributes };
  return service.conversations(conversationSid).update({
    attributes: JSON.stringify(merged)
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

export function configureServiceWebhooks({
  preWebhookUrl,
  postWebhookUrl,
  method = 'POST',
  filters = ['onMessageAdd', 'onConversationAdd'], // pre- & post-event names are allowed here
} = {}) {
  // Nothing to update? exit early.
  if (!preWebhookUrl && !postWebhookUrl) return Promise.resolve();

  return service
    .configuration
    .webhooks()
    .update({
      ...(preWebhookUrl && { preWebhookUrl }),
      ...(postWebhookUrl && { postWebhookUrl }),
      ...(filters && { filters }),
      ...(method && { method }), // 'GET' or 'POST'
    });
}
