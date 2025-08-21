import jwt from 'jsonwebtoken';
import { env } from './env.js';

export function signAgentToken(sub, workerSid, identity) {
  return jwt.sign(
    { sub, workerSid, identity },
    env.jwtSecret,
    { expiresIn: '8h', algorithm: 'HS256' }
  );
}

export function requireAuth(req, res, next) {
  const raw = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!raw) return res.status(401).json({ error: 'missing token' });
  try {
    req.claims = jwt.verify(raw, env.jwtSecret, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
