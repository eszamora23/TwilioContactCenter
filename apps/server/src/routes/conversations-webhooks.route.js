import express from 'express';


const router = express.Router();


// Twilio will POST events like onMessageAdded here if you attach a webhook per‑conversation.
router.post('/', (req, res) => {
// TODO: validate X-Twilio-Signature unless SKIP_TWILIO_VALIDATION=true (dev only)
const eventType = req.body.EventType || req.body.EventType?.toString();
console.log('[Conversations Webhook]', eventType, req.body?.MessageSid || '');
// Example: forward to Socket.IO or persist in DB
res.status(200).send('ok');
});


export default router;