import jwt from 'jsonwebtoken';
import { serverEnv, crmEnv, allowedIssuers } from './env.js';

export function signAgentToken(sub, workerSid, identity) {
  return jwt.sign(
    { sub, workerSid, identity },
    serverEnv.jwtSecret,
    { expiresIn: '8h', algorithm: 'HS256' }
  );
}

export function requireAuth(req, res, next) {
  const raw = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!raw) return res.status(401).json({ error: 'missing token' });
  try {
    req.claims = jwt.verify(raw, serverEnv.jwtSecret, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

export function requireServiceAuth(req, res, next) {
  try {
    const raw = req.headers.authorization?.split(' ')[1];
    if (!raw) return res.status(401).json({ error: 'missing auth' });
    const claims = jwt.verify(raw, crmEnv.jwtKey, { audience: crmEnv.jwtAudience });
    if (!allowedIssuers.includes(claims.iss)) return res.status(401).json({ error: 'bad issuer' });
    req.svc = claims;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid auth' });
  }
}
