import express from 'express';
import {
  createTask,
  completeTask,
  fetchTask,
  pushEvent,
  updateTask,
  listWorkers,
  listWorkerReservations,
  acceptReservation
} from '../services/taskrouter.js';
import { fetchConversation, updateConversationAttributes } from '../conversations/service.js';
import { logInteraction } from '../services/crm.js';
import { verifyTwilioSignature } from '../middleware/verifyTwilio.js';

const router = express.Router();

function toContactUri(identity) {
  const raw = String(identity || '').trim();
  if (!raw) return null;
  if (raw.startsWith('client:')) return raw;
  if (raw.startsWith('agent:')) return `client:${raw}`;
  return `client:agent:${raw}`;
}

// Twilio will POST events like onMessageAdded here if you attach a webhook per-conversation.
router.post('/', verifyTwilioSignature, async (req, res) => {
  const eventType = req.body.EventType || req.body.EventType?.toString();
  console.log('[Conversations Webhook]', eventType, req.body?.MessageSid || '');
  const io = req.app.get('io');
  try {
    if (eventType === 'onMessageAdded') {
      const author = String(req.body.Author || '').toLowerCase();
      let participantAttrs = {};
      try {
        participantAttrs = req.body.ParticipantAttributes
          ? JSON.parse(req.body.ParticipantAttributes)
          : {};
      } catch {
        participantAttrs = {};
      }
      if (author !== 'system' && participantAttrs.role !== 'agent') {
        const conversationSid = req.body.ConversationSid;
        const convo = await fetchConversation(conversationSid);
        const convoAttrs = convo.attributes ? JSON.parse(convo.attributes) : {};
        if (!convoAttrs.taskSid) {
          const task = await createTask({
            attributes: {
              channel: 'chat',
              conversationSid,
              direction: 'inbound',
              ...convoAttrs
            },
            taskChannel: 'chat'
          });
          await updateConversationAttributes(conversationSid, {
            taskSid: task.sid
          });
          pushEvent('TASK_CREATED', { taskSid: task.sid, conversationSid });
          io?.emit('task_created', { taskSid: task.sid, conversationSid });
        }
      }
    } else if (eventType === 'onMessageUpdated') {
      const conversationSid = req.body.ConversationSid;
      const messageSid = req.body.MessageSid;
      const body = req.body.Body;
      const convo = await fetchConversation(conversationSid);
      const attrs = convo.attributes ? JSON.parse(convo.attributes) : {};
      const transcript = attrs.transcript || {};
      const existing = transcript[messageSid] || {};
      const previousBody = existing.body || req.body.PreviousBody || null;
      transcript[messageSid] = { ...existing, body, updatedAt: new Date().toISOString() };
      await updateConversationAttributes(conversationSid, { transcript });
      pushEvent('MESSAGE_UPDATED', { conversationSid, messageSid, body });
      io?.emit('message_updated', { conversationSid, messageSid, body });
      if (previousBody && previousBody !== body) {
        try {
          await logInteraction({ conversationSid, messageSid, type: 'message_updated', previousBody });
        } catch (err) {
          console.warn('logInteraction failed (non-blocking)', err);
        }
      }
    } else if (eventType === 'onMessageRemoved') {
      const conversationSid = req.body.ConversationSid;
      const messageSid = req.body.MessageSid;
      const convo = await fetchConversation(conversationSid);
      const attrs = convo.attributes ? JSON.parse(convo.attributes) : {};
      const transcript = attrs.transcript || {};
      const removed = transcript[messageSid];
      delete transcript[messageSid];
      await updateConversationAttributes(conversationSid, { transcript });
      pushEvent('MESSAGE_REMOVED', { conversationSid, messageSid });
      io?.emit('message_removed', { conversationSid, messageSid });
      const previousBody = req.body.PreviousBody || removed?.body;
      if (previousBody) {
        try {
          await logInteraction({ conversationSid, messageSid, type: 'message_removed', previousBody });
        } catch (err) {
          console.warn('logInteraction failed (non-blocking)', err);
        }
      }
    } else if (eventType === 'onParticipantAdded') {
      const conversationSid = req.body.ConversationSid;
      const participantSid = req.body.ParticipantSid;
      const identity = req.body.Identity;
      let participantAttrs = {};
      try {
        participantAttrs = req.body.ParticipantAttributes
          ? JSON.parse(req.body.ParticipantAttributes)
          : {};
      } catch {
        participantAttrs = {};
      }

      const convo = await fetchConversation(conversationSid);
      const attrs = convo.attributes ? JSON.parse(convo.attributes) : {};
      const participants = attrs.participants || {};
      participants[participantSid] = { identity, role: participantAttrs.role };

      const updates = { participants };
      const now = new Date().toISOString();

      // 🚀 NUEVO: Si se une un cliente (no agente), crea el Task inmediatamente (sin esperar primer mensaje)
      if (participantAttrs.role !== 'agent' && !attrs.taskSid) {
        const task = await createTask({
          attributes: {
            channel: 'chat',
            conversationSid,
            direction: 'inbound',
            ...attrs
          },
          taskChannel: 'chat'
        });
        updates.taskSid = task.sid;
        pushEvent('TASK_CREATED', { taskSid: task.sid, conversationSid });
        io?.emit('task_created', { taskSid: task.sid, conversationSid });
      }

      if (participantAttrs.role === 'agent' && !attrs.agentJoinedAt) {
        updates.agentJoinedAt = now;
        if (attrs.taskSid) {
          try {
            const task = await fetchTask(attrs.taskSid);
            const tAttrs = task.attributes ? JSON.parse(task.attributes) : {};

            const selectedContactUri = toContactUri(identity);
            const mergedTaskAttrs = { ...tAttrs, selected_contact_uri: selectedContactUri };
            await updateTask(attrs.taskSid, {
              attributes: JSON.stringify(mergedTaskAttrs),
              priority: Math.max(100, Number(task.priority || 0))
            });
            await updateConversationAttributes(conversationSid, { selected_contact_uri: selectedContactUri });

            pushEvent('TASK_UPDATED', { taskSid: attrs.taskSid, conversationSid });
            io?.emit('task_updated', { taskSid: attrs.taskSid, conversationSid });

            try {
              const workers = await listWorkers();
              const myWorker = workers.find(w => {
                try {
                  const wAttrs = JSON.parse(w.attributes || '{}');
                  return wAttrs.contact_uri === selectedContactUri;
                } catch { return false; }
              });

              if (myWorker) {
                let accepted = false;
                for (let i = 0; i < 8 && !accepted; i++) {
                  const resvs = await listWorkerReservations(myWorker.sid);
                  const mine = resvs.find(r => r.taskSid === attrs.taskSid && String(r.reservationStatus).toLowerCase() === 'pending');
                  if (mine) {
                    await acceptReservation(myWorker.sid, mine.sid);
                    pushEvent('RESERVATION_ACCEPTED', { taskSid: attrs.taskSid, workerSid: myWorker.sid, reservationSid: mine.sid });
                    io?.emit('reservation_accepted', { taskSid: attrs.taskSid, workerSid: myWorker.sid, reservationSid: mine.sid });
                    accepted = true;
                    break;
                  }
                  await new Promise(r => setTimeout(r, 400));
                }
              }
            } catch (autoErr) {
              console.warn('[AUTO_ACCEPT] failed', autoErr?.message || autoErr);
            }
          } catch (err) {
            console.error('task update error', err);
          }
        }
      }

      await updateConversationAttributes(conversationSid, updates);
      const payload = { conversationSid, participantSid, identity, role: participantAttrs.role };
      pushEvent('PARTICIPANT_ADDED', payload);
      io?.emit('participant_added', payload);

    } else if (eventType === 'onParticipantRemoved') {
      const conversationSid = req.body.ConversationSid;
      const participantSid = req.body.ParticipantSid;
      let participantAttrs = {};
      try {
        participantAttrs = req.body.ParticipantAttributes
          ? JSON.parse(req.body.ParticipantAttributes)
          : {};
      } catch {
        participantAttrs = {};
      }
      const convo = await fetchConversation(conversationSid);
      const attrs = convo.attributes ? JSON.parse(convo.attributes) : {};
      const participants = attrs.participants || {};
      const removed = participants[participantSid];
      delete participants[participantSid];
      await updateConversationAttributes(conversationSid, { participants });
      const payload = { conversationSid, participantSid, identity: removed?.identity, role: removed?.role };
      pushEvent('PARTICIPANT_REMOVED', payload);
      io?.emit('participant_removed', payload);
      const remainingAgents = Object.values(participants).some((p) => p.role === 'agent');
      if (!remainingAgents && attrs.taskSid) {
        try {
          await updateTask(attrs.taskSid, { assignmentStatus: 'wrapping', reason: 'agent left' });
          pushEvent('CHAT_ORPHANED', { conversationSid, taskSid: attrs.taskSid });
          io?.emit('chat_orphaned', { conversationSid, taskSid: attrs.taskSid });
        } catch (err) {
          console.error('task escalation error', err);
        }
      }
    } else if (eventType === 'onConversationStateUpdated') {
      const status = String(req.body.Status || '').toLowerCase();
      if (status === 'closed') {
        const conversationSid = req.body.ConversationSid;
        const convo = await fetchConversation(conversationSid);
        const attrs = convo.attributes ? JSON.parse(convo.attributes) : {};
        const taskSid = attrs.taskSid;
        if (taskSid) {
          await completeTask(taskSid, 'Conversation closed');
          pushEvent('TASK_COMPLETED', { taskSid, conversationSid });
          io?.emit('task_completed', { taskSid, conversationSid });
        }
      }
    } else if (eventType === 'onConversationRemoved') {
      const conversationSid = req.body.ConversationSid;
      let attrs = {};
      try {
        attrs = req.body.Attributes ? JSON.parse(req.body.Attributes) : {};
      } catch {
        attrs = {};
      }
      const taskSid = attrs.taskSid;
      if (taskSid) {
        await completeTask(taskSid, 'Conversation removed');
        pushEvent('TASK_COMPLETED', { taskSid, conversationSid });
        io?.emit('task_completed', { taskSid, conversationSid });
      }
      try {
        await logInteraction({ conversationSid, taskSid, type: 'conversation_removed' });
      } catch (err) {
        console.warn('CRM cleanup failed', err);
      }
      pushEvent('CONVERSATION_REMOVED', { conversationSid, taskSid: taskSid || null });
      io?.emit('conversation_removed', { conversationSid, taskSid: taskSid || null });
    } else if (eventType === 'onDeliveryUpdated') {
      const conversationSid = req.body.ConversationSid;
      const messageSid = req.body.MessageSid;
      const deliveryStatus = req.body.DeliveryStatus;
      if (conversationSid && messageSid && deliveryStatus) {
        const convo = await fetchConversation(conversationSid);
        const attrs = convo.attributes ? JSON.parse(convo.attributes) : {};
        const receipts = attrs.deliveryReceipts || {};
        receipts[messageSid] = deliveryStatus;
        await updateConversationAttributes(conversationSid, { deliveryReceipts: receipts });
        pushEvent('MESSAGE_DELIVERY_UPDATED', { conversationSid, messageSid, deliveryStatus });
        io?.emit('message_delivery_updated', { conversationSid, messageSid, deliveryStatus });
      }
    }
    res.status(200).send('ok');
  } catch (e) {
    console.error('[Conversations Webhook] error:', e);
    res.status(500).send('error');
  }
});

export default router;
