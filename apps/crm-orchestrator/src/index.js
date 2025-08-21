// contact-center/crm-orchestrator/src/index.js
import express from 'express';
import cors from 'cors';
import { crmEnv as env } from '@shared/env';
import { v1 } from './routes.v1.js';
import { connectDb } from './db.js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/v1', v1);

// Conéctate a MongoDB Atlas (driver nativo)
await connectDb();

app.listen(env.port, () => console.log(`crm-orchestrator on :${env.port}`));
