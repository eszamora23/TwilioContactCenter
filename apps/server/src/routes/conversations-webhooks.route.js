import express from 'express';
import {
  createTask,
  completeTask,
  fetchTask,
  pushEvent,
  updateTask
} from '../services/taskrouter.js';
import { fetchConversation, updateConversationAttributes } from '../conversations/service.js';

const router = express.Router();

// Twilio will POST events like onMessageAdded here if you attach a webhook per‑conversation.
router.post('/', async (req, res) => {
  // TODO: validate X-Twilio-Signature unless SKIP_TWILIO_VALIDATION=true (dev only)
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
      if (participantAttrs.role === 'agent' && !attrs.agentJoinedAt) {
        updates.agentJoinedAt = now;
        if (attrs.taskSid) {
          try {
            const task = await fetchTask(attrs.taskSid);
            const tAttrs = task.attributes ? JSON.parse(task.attributes) : {};
            await updateTask(attrs.taskSid, {
              attributes: JSON.stringify({ ...tAttrs, agentJoinedAt: now })
            });
            pushEvent('TASK_UPDATED', {
              taskSid: attrs.taskSid,
              conversationSid
            });
            io?.emit('task_updated', {
              taskSid: attrs.taskSid,
              conversationSid
            });
          } catch (err) {
            console.error('task update error', err);
          }
        }
      }
      await updateConversationAttributes(conversationSid, updates);
      const payload = {
        conversationSid,
        participantSid,
        identity,
        role: participantAttrs.role
      };
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
      const payload = {
        conversationSid,
        participantSid,
        identity: removed?.identity,
        role: removed?.role
      };
      pushEvent('PARTICIPANT_REMOVED', payload);
      io?.emit('participant_removed', payload);
      const remainingAgents = Object.values(participants).some(
        (p) => p.role === 'agent'
      );
      if (!remainingAgents && attrs.taskSid) {
        try {
          await updateTask(attrs.taskSid, {
            assignmentStatus: 'wrapping',
            reason: 'agent left'
          });
          pushEvent('CHAT_ORPHANED', {
            conversationSid,
            taskSid: attrs.taskSid
          });
          io?.emit('chat_orphaned', {
            conversationSid,
            taskSid: attrs.taskSid
          });
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
