// contact-center/server/src/index.js
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { serverEnv as env } from 'shared/env';
import { tokens } from './routes/tokens.js';
import { health } from './routes/health.js';
import { taskrouter } from './routes/taskrouter.js';
import { voice } from './routes/voice.js';
import { validateEnv } from './validateEnv.js';
import { transfer } from './routes/transfer.js';
import { voiceControl } from './routes/voiceControl.js';
import { ivr } from './routes/ivr.js';
import { crmProxy } from './routes/crm.js';
import chatTokenRoute from './routes/chat-token.route.js';
import conversationsRoute from './routes/conversations.route.js';
import conversationsWebhooksRoute from './routes/conversations-webhooks.route.js';
import conversationsPreWebhooksRoute from './routes/conversations-prewebhooks.route.js';
import { configureServiceWebhooks } from './conversations/service.js';
import { video as videoRoutes } from './routes/video.js';

// 🚀 Nuevo: rutas de demo (llamadas de prueba Phone Lab)
import demoRoutes from './routes/demo-routes.js';

const app = express();
validateEnv();
app.set('trust proxy', true);

// --- CORS config (HTTP & Socket.IO) ---
const corsOrigins = (env.corsOrigin || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const origin =
  env.corsOrigin === '*'
    ? true
    : corsOrigins.length
      ? corsOrigins
      : false; // false = bloquea si no hay match

const corsOptions = {
  origin,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // si no usas cookies, puedes dejarlo en false; con Authorization no hay problema
  maxAge: 86400,     // cache preflight 24h
};

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight global

// --- Rutas API ---
app.use('/api', health);
app.use('/api', tokens);
app.use('/api', taskrouter);
app.use('/api', voice);
app.use('/api', transfer);
app.use('/api', voiceControl);
app.use('/api/ivr/finance', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }));
app.use('/api', ivr);
app.use('/api', crmProxy);
app.use('/api/chat', chatTokenRoute);
app.use('/api', videoRoutes);
app.use('/api/conversations', conversationsRoute);
app.use('/webhooks/conversations/pre', conversationsPreWebhooksRoute);
app.use('/webhooks/conversations', conversationsWebhooksRoute);

// --- Rutas DEMO (Phone Lab / softphone embebido) ---
// El frontend llama a: POST ${API_BASE}/demo/call/start
// Por eso montamos el router exactamente en /demo (sin /api).
app.use('/demo', rateLimit({ windowMs: 15 * 60 * 1000, max: 15 }));
app.use('/demo', demoRoutes);

if (env.publicBaseUrl) {
  configureServiceWebhooks({
    preWebhookUrl: `${env.publicBaseUrl}/webhooks/conversations/pre`,
    postWebhookUrl: `${env.publicBaseUrl}/webhooks/conversations`,
    // Un solo "filters" sirve para pre y post; incluye eventos pre y post.
    filters: [
      'onConversationAdd', 'onMessageAdd',                    // PRE
      'onMessageAdded', 'onMessageUpdated', 'onMessageRemoved',// POST
      'onParticipantAdded', 'onParticipantRemoved',
      'onDeliveryUpdated', 'onConversationStateUpdated'
    ],
    method: 'POST'
  }).catch(e => console.error('Failed to configure Conversations webhooks', e));
}

// --- HTTP + Socket.IO con CORS ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// comparte io con los routers para poder emitir eventos (p. ej. presence_update)
app.set('io', io);

server.listen(env.port, () => console.log(`server on :${env.port}`));
