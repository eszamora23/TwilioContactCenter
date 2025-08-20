import { Router } from 'express';
export const health = Router().get('/health', (_req, res) => res.json({ ok: true }));
