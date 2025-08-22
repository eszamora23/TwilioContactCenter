import { twilioClient as client } from './client.js';


const {
TWILIO_MESSAGING_SERVICE_SID, // optional MGxxxxxxxx for SMS/WhatsApp
TWILIO_SMS_NUMBER, // optional +E.164
TWILIO_WHATSAPP_NUMBER, // optional +E.164 (without whatsapp: prefix)
TWILIO_MESSENGER_PAGE_ID, // optional FB Page ID for Messenger
} = process.env;


/**
* Create or fetch a Conversation by uniqueName. Prefer uniqueName as a stable key per case/ticket.
*/
export async function getOrCreateConversation({ uniqueName, friendlyName, attributes = {} }) {
  if (!uniqueName) throw new Error('uniqueName required');
  try {
    // Twilio REST allows SID or uniqueName in the path for fetch — we attempt fetch first.
    return await client.conversations.v1.conversations(uniqueName).fetch();
  } catch (err) {
    if (err.status !== 404) throw err;
    return client.conversations.v1.conversations.create({
      uniqueName,
      friendlyName: friendlyName || uniqueName,
      attributes: JSON.stringify({ ...attributes, taskSid: null }),
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID || undefined,
    });
  }
}


/** Add a WebChat participant via Conversations SDK identity */
export function addChatParticipant(conversationSid, { identity, attributes } = {}) {
if (!identity) throw new Error('identity required');
return client.conversations.v1.conversations(conversationSid).participants.create({
identity,
attributes: attributes ? JSON.stringify(attributes) : undefined,
});
}


/** Add an SMS participant using messagingBinding */
export function addSmsParticipant(conversationSid, { to, from }) {
const proxy = from || TWILIO_SMS_NUMBER;
if (!to || !proxy) throw new Error('to and from (or TWILIO_SMS_NUMBER) are required');
return client.conversations.v1.conversations(conversationSid).participants.create({
'messagingBinding.address': to, // e.g. +15551234567
'messagingBinding.proxyAddress': proxy, // your Twilio SMS number
});
}


/** Add a WhatsApp participant using messagingBinding */
export function addWhatsappParticipant(conversationSid, { to, from }) {
const proxy = from || TWILIO_WHATSAPP_NUMBER;
if (!to || !proxy) throw new Error('to and from (or TWILIO_WHATSAPP_NUMBER) are required');
return client.conversations.v1.conversations(conversationSid).participants.create({
'messagingBinding.address': `whatsapp:${to}`,
'messagingBinding.proxyAddress': `whatsapp:${proxy}`,
});
}


/** Add a Messenger participant (requires existing contact & Page) */
export function addMessengerParticipant(conversationSid, { userId, pageId }) {
const proxy = pageId || TWILIO_MESSENGER_PAGE_ID;
if (!userId || !proxy) throw new Error('userId and pageId (or TWILIO_MESSENGER_PAGE_ID) are required');
return client.conversations.v1.conversations(conversationSid).participants.create({
'messagingBinding.address': `messenger:${userId}`,
'messagingBinding.proxyAddress': `messenger:${proxy}`,
});
}


/** Send a message (works for all channels) */
export function sendMessage(conversationSid, { author = 'system', body, mediaSid, attributes }) {
const payload = { author };
if (body) payload.body = body;
if (mediaSid) payload.mediaSid = mediaSid;
if (attributes) payload.attributes = JSON.stringify(attributes);
return client.conversations.v1.conversations(conversationSid).messages.create(payload);
}


/** Optional: attach a conversation‑scoped webhook (Studio/webhook/trigger) */
export function attachWebhook(conversationSid, { target = 'webhook', url, method = 'post', filters = ['onMessageAdded'], flowSid }) {
const cfg = {};
if (target === 'webhook') {
cfg['configuration.url'] = url;
cfg['configuration.method'] = method;
cfg['configuration.filters'] = filters;
} else if (target === 'studio') {
cfg['configuration.flowSid'] = flowSid;
}
return client.conversations.v1.conversations(conversationSid).webhooks.create({ target, ...cfg });
}

export const fetchConversation = (sid) =>
  client.conversations.v1.conversations(sid).fetch();

export async function updateConversationAttributes(conversationSid, newAttributes = {}) {
  const convo = await fetchConversation(conversationSid);
  const current = convo.attributes ? JSON.parse(convo.attributes) : {};
  const merged = { ...current, ...newAttributes };
  return client.conversations.v1.conversations(conversationSid).update({
    attributes: JSON.stringify(merged)
  });
}