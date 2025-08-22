import express from 'express';
import { createTask, completeTask, pushEvent } from '../services/taskrouter.js';

const router = express.Router();
const tasksByConversation = new Map();

// Twilio will POST events like onMessageAdded here if you attach a webhook per‑conversation.
router.post('/', async (req, res) => {
  // TODO: validate X-Twilio-Signature unless SKIP_TWILIO_VALIDATION=true (dev only)
  const eventType = req.body.EventType || req.body.EventType?.toString();
  console.log('[Conversations Webhook]', eventType, req.body?.MessageSid || '');
  const io = req.app.get('io');
  try {
    if (eventType === 'onConversationAdded') {
      const source = String(req.body.Source || '').toLowerCase();
      if (!['api', 'sdk'].includes(source)) {
        const conversationSid = req.body.ConversationSid;
        const task = await createTask({
          attributes: { channel: 'chat', conversationSid, direction: 'inbound' },
          taskChannel: 'chat'
        });
        tasksByConversation.set(conversationSid, task.sid);
        pushEvent('TASK_CREATED', { taskSid: task.sid, conversationSid });
        io?.emit('task_created', { taskSid: task.sid, conversationSid });
      }
    } else if (eventType === 'onConversationStateUpdated') {
      const status = String(req.body.Status || '').toLowerCase();
      if (status === 'closed') {
        const conversationSid = req.body.ConversationSid;
        const taskSid = tasksByConversation.get(conversationSid);
        if (taskSid) {
          await completeTask(taskSid, 'Conversation closed');
          pushEvent('TASK_COMPLETED', { taskSid, conversationSid });
          io?.emit('task_completed', { taskSid, conversationSid });
          tasksByConversation.delete(conversationSid);
        }
      }
    }
    res.status(200).send('ok');
  } catch (e) {
    console.error('[Conversations Webhook] error:', e);
    res.status(500).send('error');
  }
});

export default router;
