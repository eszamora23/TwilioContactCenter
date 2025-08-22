import express from 'express';
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
} from '../conversations/service.js';


const router = express.Router();


// Create or get a conversation by uniqueName
router.post('/', async (req, res) => {
const { uniqueName, friendlyName, attributes } = req.body;
try {
const convo = await getOrCreateConversation({ uniqueName, friendlyName, attributes });
res.json(convo);
} catch (e) {
res.status(500).json({ error: e.message });
}
});


// Add a participant; body.type: chat|sms|whatsapp|messenger
router.post('/:sid/participants', async (req, res) => {
const { sid } = req.params;
const { type } = req.body;
try {
let result;
switch (type) {
case 'chat': {
const { identity, attributes } = req.body;
result = await addChatParticipant(sid, { identity, attributes });
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
res.status(500).json({ error: e.message });
}
});


// Send a message
router.post('/:sid/messages', async (req, res) => {
const { sid } = req.params;
try {
const msg = await sendMessage(sid, req.body);
res.json(msg);
} catch (e) {
res.status(500).json({ error: e.message });
}
});

// Retrieve delivery receipts for a message
router.get('/:sid/messages/:messageSid/receipts', async (req, res) => {
  const { sid, messageSid } = req.params;
  try {
    const receipts = await listMessageReceipts(sid, messageSid);
    res.json(receipts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Update conversation timers (e.g., to hang up)
router.post('/:sid/timers', async (req, res) => {
const { sid } = req.params;
try {
const convo = await updateConversationTimers(sid, req.body);
res.json(convo);
} catch (e) {
res.status(500).json({ error: e.message });
}
});


// Attach a Conversation‑scoped webhook (optional)
router.post('/:sid/webhooks', async (req, res) => {
const { sid } = req.params;
try {
const wh = await attachWebhook(sid, req.body);
res.json(wh);
} catch (e) {
res.status(500).json({ error: e.message });
}
});


export default router;
