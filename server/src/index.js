// contact-center/server/src/index.js
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { tokens } from './routes/tokens.js';
import { health } from './routes/health.js';
import { taskrouter } from './routes/taskrouter.js';
import { voice } from './routes/voice.js';
import { validateEnv } from './validateEnv.js';
import { transfer } from './routes/transfer.js';
import { voiceControl } from './routes/voiceControl.js';
import { ivr } from './routes/ivr.js';
import { crmProxy } from './routes/crm.js';

const app = express();
validateEnv();
app.set('trust proxy', true);

// --- CORS config (HTTP & Socket.IO) ---
const corsOrigins = (env.corsOrigin || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: corsOrigins.length ? corsOrigins : false, // false = bloquea si no hay match
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

// --- HTTP + Socket.IO con CORS ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins.length ? corsOrigins : false,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// comparte io con los routers para poder emitir eventos (p. ej. presence_update)
app.set('io', io);

server.listen(env.port, () => console.log(`server on :${env.port}`));
