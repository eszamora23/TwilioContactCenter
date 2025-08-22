import express from 'express';
import { createTask, completeTask, pushEvent } from '../services/taskrouter.js';
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
      const isAgent = participantAttrs.role === 'agent';
      if (author !== 'system' && !isAgent) {
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
