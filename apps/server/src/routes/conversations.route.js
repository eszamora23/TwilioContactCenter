// contact-center/server/src/routes/conversations.route.js
import express from 'express';
import { serverEnv as env } from 'shared/env';
import {
  getOrCreateConversation,
  addChatParticipant,
  addSmsParticipant,
  addWhatsappParticipant,
  addMessengerParticipant,
  sendMessage,
  attachWebhook,
  updateConversationTimers,
  listMessageReceipts,
  closeConversation,
  fetchConversation,
  listParticipants,
  updateConversationAttributes,
} from '../conversations/service.js';
import { createTask, pushEvent } from '../services/taskrouter.js';

const router = express.Router();

/* ----------------------------- utils ----------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeJsonParse(maybeJson, fallback = {}) {
  try {
    if (maybeJson == null) return fallback;
    if (typeof maybeJson === 'object') return maybeJson;
    return JSON.parse(maybeJson);
  } catch {
    return fallback;
  }
}

function filterTaskAttrs(attrs) {
  const omit = new Set([
    'transcript',
    'deliveryReceipts',
    'participants',
    'timers',
    'taskSid',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    if (omit.has(k)) continue;
    out[k] = v;
  }
  if (!out.channel) out.channel = 'chat';
  return out;
}

/** Evita doble creación cuando hay carreras */
const creatingTaskFor = new Set();
async function ensureTaskForConversation(conversationSid, baseAttrs = {}, io) {
  if (!conversationSid) return null;

  if (creatingTaskFor.has(conversationSid)) {
    // Espera breve por si otra rama lo completa
    for (let i = 0; i < 6; i++) await sleep(80);
  }
  creatingTaskFor.add(conversationSid);

  try {
    const convo = await fetchConversation(conversationSid);
    const attrs = safeJsonParse(convo.attributes, {});
    if (attrs.taskSid) return attrs.taskSid;

    const task = await createTask({
      attributes: {
        ...filterTaskAttrs(attrs),
        ...filterTaskAttrs(baseAttrs),
        conversationSid,
        direction: attrs.direction || baseAttrs.direction || 'inbound',
      },
      taskChannel: 'chat',
    });

    await updateConversationAttributes(conversationSid, { taskSid: task.sid });
    pushEvent('TASK_CREATED', { taskSid: task.sid, conversationSid });
    io?.emit?.('task_created', { taskSid: task.sid, conversationSid });
    return task.sid;
  } finally {
    creatingTaskFor.delete(conversationSid);
  }
}

/* ----------------------------- routes ----------------------------- */

// Create or get a conversation by uniqueName
router.post('/', async (req, res) => {
  const { uniqueName, friendlyName, attributes } = req.body;
  try {
    const convo = await getOrCreateConversation({ uniqueName, friendlyName, attributes });

    // (Opcional) Adjunta webhook por-conversación para mayor resiliencia
    try {
      if (env.publicBaseUrl) {
        await attachWebhook(convo.sid, {
          target: 'webhook',
          url: `${env.publicBaseUrl}/webhooks/conversations`,
          method: 'POST',
          filters: ['onParticipantAdded', 'onMessageAdded', 'onConversationStateUpdated'],
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[attachWebhook] skipped/failed:', e?.message || e);
    }

    res.json(convo);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Add a participant; body.type: chat|sms|whatsapp|messenger
router.post('/:sid/participants', async (req, res) => {
  const { sid } = req.params;
  const { type } = req.body;
  const io = req.app.get('io');

  try {
    let result;

    switch (type) {
      case 'chat': {
        const { identity, attributes } = req.body;
        result = await addChatParticipant(sid, { identity, attributes });

        // Crear Task INMEDIATO si el participante NO es agente
        const role = String(attributes?.role || '').toLowerCase();
        if (role !== 'agent') {
          await ensureTaskForConversation(sid, { direction: 'inbound' }, io);
        }
        break;
      }

      case 'sms': {
        const { to, from } = req.body;
        result = await addSmsParticipant(sid, { to, from });
        break;
      }

      case 'whatsapp': {
        const { to, from } = req.body;
        result = await addWhatsappParticipant(sid, { to, from });
        break;
      }

      case 'messenger': {
        const { userId, pageId } = req.body;
        result = await addMessengerParticipant(sid, { userId, pageId });
        break;
      }

      default:
        return res.status(400).json({ error: 'Unsupported type' });
    }

    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Send a message
router.post('/:sid/messages', async (req, res) => {
  const { sid } = req.params;
  try {
    const msg = await sendMessage(sid, req.body);
    res.json(msg);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Retrieve delivery receipts for a message
router.get('/:sid/messages/:messageSid/receipts', async (req, res) => {
  const { sid, messageSid } = req.params;
  try {
    const receipts = await listMessageReceipts(sid, messageSid);
    res.json(receipts);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Quick state probe for smart UI
router.get('/:sid/state', async (req, res) => {
  const { sid } = req.params;
  try {
    const convo = await fetchConversation(sid);
    const stateRaw = convo?.state || convo?.status || 'unknown';
    const state = String(stateRaw).toLowerCase();
    let participantsCount;
    try {
      const parts = await listParticipants(sid);
      participantsCount = parts?.length ?? undefined;
    } catch {
      participantsCount = undefined;
    }
    res.json({ sid, state, closed: state === 'closed', participantsCount });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Legacy/fallback timers update
router.post('/:sid/timers', async (req, res) => {
  const { sid } = req.params;
  try {
    const convo = await updateConversationTimers(sid, req.body);
    res.json(convo);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Close conversation hard (timers to PT0S + remove participants)
router.post('/:sid/close', async (req, res) => {
  const { sid } = req.params;
  const { removeParticipants = true } = req.body || {};
  try {
    const out = await closeConversation(sid, { removeParticipants });
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Attach a Conversation-scoped webhook (manual)
router.post('/:sid/webhooks', async (req, res) => {
  const { sid } = req.params;
  try {
    const wh = await attachWebhook(sid, req.body);
    res.json(wh);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
