import express from 'express';
import { fetchConversation } from '../conversations/service.js';

const router = express.Router();

// Simple content moderation placeholder. In a real implementation
// you might call an external service or a more sophisticated model.
const MAX_MESSAGE_LENGTH = 1600;
const bannedWords = ['banned', 'profanity'];

// Allowed email domains for new conversations
const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

function failsModeration(body = '') {
  const lower = body.toLowerCase();
  return bannedWords.some(w => lower.includes(w));
}

router.post('/', async (req, res) => {
  const eventType = req.body.EventType || req.body.EventType?.toString();
  console.log('[Conversations PreWebhook]', eventType, req.body?.MessageSid || req.body?.ConversationSid || '');

  try {
    if (eventType === 'onConversationAdd') {
      let attrs = {};
      try {
        attrs = req.body.Attributes ? JSON.parse(req.body.Attributes) : {};
      } catch (err) {
        return res.status(422).send('Invalid attributes');
      }

      const email = attrs.email ? String(attrs.email).toLowerCase() : '';
      if (!email) {
        return res.status(422).send('email required');
      }

      const domain = email.split('@')[1];
      if (allowedDomains.length && !allowedDomains.includes(domain)) {
        return res.status(403).send('email domain not allowed');
      }

      // Ensure email/uniqueName is not already used
      try {
        await fetchConversation(email);
        return res.status(409).send('conversation already exists');
      } catch (err) {
        if (err.status && err.status !== 404) {
          console.error('[Conversations PreWebhook] uniqueness check failed', err);
          return res.status(500).send('error');
        }
        // 404 => not found => ok
      }
    }

    if (eventType === 'onMessageAdd') {
      const body = req.body.Body || '';

      if (body.length > MAX_MESSAGE_LENGTH) {
        return res.status(413).send('Message too long');
      }

      if (failsModeration(body)) {
        return res.status(422).send('Message failed moderation');
      }
    }

    res.status(200).send('ok');
  } catch (e) {
    console.error('[Conversations PreWebhook] error:', e);
    res.status(500).send('error');
  }
});

export default router;

