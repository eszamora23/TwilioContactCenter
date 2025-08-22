import express from 'express';
import { createConversationsToken } from '../conversations/tokens.js';


const router = express.Router();


// Issue a short‑lived SDK token for WebChat clients
router.get('/token', (req, res) => {
// Your auth layer can set req.user; here we fall back to a random guest
const identity = (req.user?.id && `agent:${req.user.id}`) || `guest:${crypto.randomUUID()}`;
try {
const token = createConversationsToken(identity, 3600); // 1 hour TTL
res.json({ token, identity });
} catch (e) {
res.status(500).json({ error: e.message });
}
});

// Refresh an SDK token before or after it expires
router.get('/refresh', (req, res) => {
  const { identity } = req.query;
  if (!identity) {
    res.status(400).json({ error: 'identity is required' });
    return;
  }
  try {
    const token = createConversationsToken(identity, 3600); // 1 hour TTL
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


export default router;
