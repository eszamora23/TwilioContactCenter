// contact-center/server/src/controllers/video.js
import { rest } from '../twilio.js';
import { buildVideoToken } from '../twilio.js';
import { fetchConversation, updateConversationAttributes, listParticipants } from '../conversations/service.js';

const ENABLED = String(process.env.ENABLE_VIDEO || 'false').toLowerCase() === 'true';

// ✅ Usa 'group' por defecto y valida tipos permitidos
const ROOM_TYPE_ENV = (process.env.VIDEO_ROOM_TYPE || 'group').trim();
const ALLOWED_TYPES = new Set(['group', 'group-small', 'peer-to-peer', 'go']);
const ROOM_TYPE = ALLOWED_TYPES.has(ROOM_TYPE_ENV) ? ROOM_TYPE_ENV : 'group';

const MAX_AGENTS = parseInt(process.env.VIDEO_MAX_AGENTS_PER_ROOM || '1', 10) || 1;
// Opcional: const REGION = process.env.VIDEO_REGION;

/* =========================
 * Helpers
 * ========================= */
function roomNameFor({ conversationSid, taskSid, name }) {
  if (name) return name;
  if (conversationSid) return `conv_${conversationSid}`;
  if (taskSid) return `task_${taskSid}`;
  return `room_${Date.now()}`;
}

/** Extrae ConversationSid desde un roomName conv_CHxxxxxxxx... */
function parseConversationSidFromRoomName(roomName) {
  const m = String(roomName || '').match(/^conv_(CH[a-zA-Z0-9]{32})$/);
  return m ? m[1] : null;
}

function cleanIdentity(identity) {
  const raw = String(identity || '').trim();
  return raw.startsWith('client:') ? raw.slice('client:'.length) : raw;
}

/** Verifica que identity sea participante de la Conversation */
async function assertParticipant({ conversationSid, identity }) {
  if (!conversationSid || !identity) {
    const err = new Error('conversationSid and identity required');
    err.status = 400;
    throw err;
  }
  // Asegura que la conversación exista
  await fetchConversation(conversationSid);
  // Lista participantes y valida
  const parts = await listParticipants(conversationSid);
  const who = cleanIdentity(identity);
  const ok = parts.some((p) => p.identity === who);
  if (!ok) {
    const err = new Error('identity is not a participant of this conversation');
    err.status = 403;
    throw err;
  }
}

async function ensureRoom({ uniqueName }) {
  try {
    const existing = await rest.video.v1.rooms(uniqueName).fetch();
    const st = String(existing.status || '').toLowerCase();
    if (['in-progress', 'connected', 'open'].includes(st)) return existing;
    // Si está 'completed', crea nuevo con sufijo
    uniqueName = `${uniqueName}_${Date.now()}`;
  } catch {
    // 404 => crear
  }

  // Crear con el tipo elegido y reintentar con 'group' si Twilio rechaza el tipo (legacy/invalid)
  try {
    return await rest.video.v1.rooms.create({
      uniqueName,
      type: ROOM_TYPE,
      // recordParticipantsOnConnect: false,
      // region: REGION || undefined,
    });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    const isTypeErr =
      e?.status === 400 ||
      msg.includes('legacy room type') ||
      msg.includes('unsupported') ||
      msg.includes('invalid "type"') ||
      msg.includes('room type');

    if (isTypeErr && ROOM_TYPE !== 'group') {
      // Fallback robusto a 'group'
      return await rest.video.v1.rooms.create({
        uniqueName,
        type: 'group',
      });
    }
    throw e;
  }
}

// Evita 2 agentes en la misma sala
async function agentSlotAvailable(uniqueName, identity) {
  try {
    const list = await rest.video.v1.rooms(uniqueName)
      .participants
      .list({ status: 'connected', limit: 50 });
    const agents = list.filter((p) => String(p.identity || '').startsWith('agent:'));
    // Si el mismo agente reintenta, permitimos
    if (agents.some((a) => a.identity === cleanIdentity(identity))) return true;
    return agents.length < MAX_AGENTS;
  } catch {
    // Si no se puede listar, preferimos dejar pasar para no bloquear operativa
    return true;
  }
}

/* =========================
 * Controller
 * ========================= */
export const videoController = {
  enabled: (_req, res) => res.json({ enabled: ENABLED }),

  /**
   * Crea/obtiene Room y (si hay Conversation) marca atributos.
   * Seguridad:
   *  - Si viene identity (agente via JWT o guest via body), validamos pertenencia.
   *  - Si NO viene identity (p.ej., webchat antiguo), permitimos crear la sala pero
   *    la emisión del token (siguiente paso) sí validará pertenencia.
   */
  ensureRoom: async (req, res) => {
    try {
      if (!ENABLED) return res.status(404).json({ error: 'video disabled' });

      const { conversationSid, taskSid, name, identity: bodyIdentity } = req.body || {};
      const claimsIdentity = req.claims?.identity; // presente si el caller es agente autenticado
      const callerIdentity = claimsIdentity || bodyIdentity || null;

      // Si tenemos identidad y conversationSid, validamos pertenencia:
      if (callerIdentity && conversationSid) {
        await assertParticipant({ conversationSid, identity: callerIdentity });
      }

      const uniqueName = roomNameFor({ conversationSid, taskSid, name });
      const room = await ensureRoom({ uniqueName });

      if (conversationSid) {
        try {
          await updateConversationAttributes(conversationSid, {
            video: { roomName: room.uniqueName, roomSid: room.sid, startedAt: new Date().toISOString() }
          });
        } catch (e) {
          // no bloqueante
          console.warn('[video/ensure-room] updateConversationAttributes skipped:', e?.message || e);
        }
      }

      res.json({ roomName: room.uniqueName, roomSid: room.sid, type: room.type });
    } catch (e) {
      const code = e.status || 500;
      console.error('[video/ensure-room]', e?.message || e);
      res.status(code).json({ error: e.message || 'cannot ensure room' });
    }
  },

  /**
   * Token para AGENTE (cookie/JWT requerida a nivel de router).
   * Adicionalmente:
   *  - si el roomName está ligado a una conversación (conv_CH...), validamos que el agente sea participante del chat.
   *  - limitamos el número de agentes simultáneos por sala con MAX_AGENTS.
   */
  tokenAgent: async (req, res) => {
    try {
      if (!ENABLED) return res.status(404).json({ error: 'video disabled' });
      const identity = req.claims?.identity;
      const { roomName } = req.query || {};
      if (!identity || !roomName) return res.status(400).json({ error: 'missing identity or roomName' });

      const convSid = parseConversationSidFromRoomName(roomName);
      if (convSid) {
        await assertParticipant({ conversationSid: convSid, identity });
      }

      const allowed = await agentSlotAvailable(roomName, identity);
      if (!allowed) return res.status(409).json({ error: 'room already has an agent' });

      const token = buildVideoToken(identity, roomName);
      res.json({ token, identity });
    } catch (e) {
      const code = e.status || 500;
      console.error('[video/tokenAgent]', e?.message || e);
      res.status(code).json({ error: e.message || 'cannot issue token' });
    }
  },

  /**
   * Token para invitado (webchat público).
   * Seguridad:
   *  - exigimos que roomName tenga formato conv_{ConversationSid}.
   *  - validamos que identity pertenezca a esa Conversation antes de emitir token.
   */
  tokenGuest: async (req, res) => {
    try {
      if (!ENABLED) return res.status(404).json({ error: 'video disabled' });

      const identity = String(req.query.identity || '').trim(); // ej: "guest:uuid"
      const roomName = String(req.query.roomName || '').trim();
      if (!identity || !roomName) return res.status(400).json({ error: 'identity and roomName required' });

      const conversationSid = parseConversationSidFromRoomName(roomName);
      if (!conversationSid) return res.status(400).json({ error: 'invalid roomName (must be conv_{ConversationSid})' });

      await assertParticipant({ conversationSid, identity });

      const token = buildVideoToken(identity, roomName);
      res.json({ token, identity });
    } catch (e) {
      const code = e.status || 500;
      console.error('[video/tokenGuest]', e?.message || e);
      res.status(code).json({ error: e.message || 'cannot issue guest token' });
    }
  },
};
