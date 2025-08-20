import jwt from 'jsonwebtoken';
import { allowedIssuers, env } from './env.js';

export function requireServiceAuth(req, res, next) {
  try {
    const raw = req.headers.authorization?.split(' ')[1];
    if (!raw) return res.status(401).json({ error: 'missing auth' });
    const claims = jwt.verify(raw, env.jwtKey, { audience: env.jwtAudience });
    if (!allowedIssuers.includes(claims.iss)) return res.status(401).json({ error: 'bad issuer' });
    req.svc = claims;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid auth' });
  }
}
