import express from 'express';

const router = express.Router();

// Simple content moderation placeholder. In a real implementation
// you might call an external service or a more sophisticated model.
const MAX_MESSAGE_LENGTH = 1600;
const bannedWords = ['banned', 'profanity'];

function failsModeration(body = '') {
  const lower = body.toLowerCase();
  return bannedWords.some(w => lower.includes(w));
}

router.post('/', (req, res) => {
  const eventType = req.body.EventType || req.body.EventType?.toString();
  console.log('[Conversations PreWebhook]', eventType, req.body?.MessageSid || '');

  try {
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

