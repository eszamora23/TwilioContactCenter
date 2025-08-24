import { useEffect, useState, useRef } from 'react';
import { Client as ConversationsClient } from '@twilio/conversations';
import { Box } from '@twilio-paste/core/box';
import {
  ChatLog,
  ChatMessage,
  ChatBubble,
  ChatMessageMeta,
  ChatMessageMetaItem,
} from '@twilio-paste/core/chat-log';
import { Input } from '@twilio-paste/core/input';
import { Button } from '@twilio-paste/core/button';
import { Heading } from '@twilio-paste/core/heading';
import { Text } from '@twilio-paste/core/text';
import Video from 'twilio-video';
import styles from './ChatWidget.module.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const VIDEO_FLAG = String(import.meta.env.VITE_VIDEO_ENABLED || 'false').toLowerCase() === 'true';

/* ============================================================
 * Video helpers inline (hook + panel) para dejar el archivo autónomo
 * ============================================================ */
function useVideoRoom() {
  const roomRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    return () => {
      try { roomRef.current?.disconnect(); } catch {}
      roomRef.current = null;
    };
  }, []);

  const connect = async ({ token, roomName }) => {
    if (!token || !roomName || roomRef.current) return;
    setConnecting(true);
    const r = await Video.connect(token, {
      name: roomName,
      audio: true,
      video: { width: 640 },
    });
    roomRef.current = r;
    setRoom(r);

    const snapshot = () => Array.from(r.participants.values());
    setParticipants(snapshot());

    const onParticipantConnected = () => setParticipants(snapshot());
    const onParticipantDisconnected = () => setParticipants(snapshot());
    const onDisconnected = () => {
      setParticipants([]);
      setRoom(null);
      roomRef.current = null;
    };

    r.on('participantConnected', onParticipantConnected);
    r.on('participantDisconnected', onParticipantDisconnected);
    r.on('disconnected', onDisconnected);

    setConnecting(false);
  };

  const disconnect = async () => {
    try { roomRef.current?.disconnect(); } finally {
      roomRef.current = null;
      setRoom(null);
      setParticipants([]);
    }
  };

  return { room, participants, connecting, connect, disconnect };
}

function RemoteParticipant({ participant }) {
  const holder = useRef(null);

  useEffect(() => {
    if (!participant) return;

    const attachTrack = (track) => {
      if (!track || !holder.current) return;
      // evita duplicados por sid de track
      if (holder.current.querySelector(`[data-track-sid="${track.sid}"]`)) return;
      const el = track.attach();
      el.dataset.trackSid = track.sid;
      el.dataset.trackKind = track.kind;
      holder.current.appendChild(el);
    };

    const detachTrack = (track) => {
      try { track.detach().forEach((el) => el.remove()); } catch {}
    };

    // 1) Adjunta los tracks ya suscritos (publications -> track)
    participant.tracks.forEach((pub) => {
      if (pub.track) attachTrack(pub.track);
      // Además, engancha los eventos de la publication por si aún no estaba suscrito
      pub.on?.('subscribed', attachTrack);
      pub.on?.('unsubscribed', detachTrack);
    });

    // 2) Para subscripciones nuevas (eventos del participante)
    const onTrackSubscribed = (track) => attachTrack(track);
    const onTrackUnsubscribed = (track) => detachTrack(track);
    const onTrackPublished = (publication) => {
      // Si al publicar ya hay track (raro), adjúntalo
      if (publication.track) attachTrack(publication.track);
      publication.on?.('subscribed', attachTrack);
      publication.on?.('unsubscribed', detachTrack);
    };

    participant.on('trackSubscribed', onTrackSubscribed);
    participant.on('trackUnsubscribed', onTrackUnsubscribed);
    participant.on('trackPublished', onTrackPublished);

    // Limpieza
    return () => {
      participant.off('trackSubscribed', onTrackSubscribed);
      participant.off('trackUnsubscribed', onTrackUnsubscribed);
      participant.off('trackPublished', onTrackPublished);
      participant.tracks.forEach((pub) => pub.track && detachTrack(pub.track));
    };
  }, [participant]);

  return (
    <Box flex="1" minWidth="280px">
      <h4 style={{ marginTop: 0 }}>{participant.identity || 'Remote'}</h4>
      <div ref={holder} />
    </Box>
  );
}



function VideoPanel({ room, participants, onClose }) {
  const localRef = useRef(null);

  useEffect(() => {
    if (!room) return;
    const local = room.localParticipant;

    // Adjunta medios locales actuales
    local.tracks.forEach((pub) => {
      const track = pub.track;
      if (!track || !localRef.current) return;
      // evita duplicados
      if (localRef.current.querySelector(`[data-name="${track.name}"]`)) return;
      const el = track.attach();
      el.dataset.name = track.name;
      localRef.current.appendChild(el);
    });

    return () => {
      try {
        local.tracks.forEach((pub) =>
          pub.track?.detach()?.forEach((el) => el.remove())
        );
      } catch {}
    };
  }, [room]);

  return (
    <Box
      borderStyle="solid"
      borderColor="colorBorderWeaker"
      borderWidth="borderWidth10"
      borderRadius="borderRadius30"
      padding="space60"
    >
      <Box display="flex" columnGap="space60" style={{ flexWrap: 'wrap' }}>
        <Box flex="1" minWidth="280px">
          <h4 style={{ marginTop: 0 }}>You</h4>
          <div ref={localRef} />
        </Box>
        {participants.map((p) => (
          <RemoteParticipant key={p.sid} participant={p} />
        ))}
      </Box>
      <Box marginTop="space60">
        <Button variant="destructive" onClick={onClose}>
          Finalizar video
        </Button>
      </Box>
    </Box>
  );
}

/* ============================================================
 * ChatWidget
 * ============================================================ */
export default function ChatWidget({
  conversationIdOrUniqueName,
  onMessageAdded,
  onLabel,
  isActive,
}) {
  const [client, setClient] = useState(null);
  const clientRef = useRef(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const identityRef = useRef();
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  // Video state
  const [videoFeatureEnabled, setVideoFeatureEnabled] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoRoomName, setVideoRoomName] = useState('');
  const { room, participants, connecting, connect, disconnect } = useVideoRoom();

  // Mantener refs para callbacks inestables (no usarlas como deps de efectos con listeners)
  const onMessageAddedRef = useRef(onMessageAdded);
  const onLabelRef = useRef(onLabel);
  useEffect(() => { onMessageAddedRef.current = onMessageAdded; }, [onMessageAdded]);
  useEffect(() => { onLabelRef.current = onLabel; }, [onLabel]);

  // --- Token de Conversations (agente) ---
  const fetchToken = async () => {
    const url = identityRef.current
      ? `${API_BASE}/chat/refresh?identity=${encodeURIComponent(identityRef.current)}`
      : `${API_BASE}/chat/token`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`chat token failed: ${r.status} ${txt}`);
    }
    const data = await r.json();
    if (data.identity) identityRef.current = data.identity;
    return data.token;
  };

  // Bootstrap SDK (un cliente por widget) y resolver conversación (con retry si aún no estamos unidos)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await fetchToken();
        const c = new ConversationsClient(token);
        clientRef.current = c;

        const refresh = async () => {
          try {
            const newToken = await fetchToken();
            await c.updateToken(newToken);
          } catch (e) {
            console.error('[ChatWidget] token refresh error', e);
          }
        };
        c.on('tokenAboutToExpire', refresh);
        c.on('tokenExpired', refresh);

        if (cancelled) {
          try { c.removeAllListeners?.(); c.shutdown?.(); } catch {}
          return;
        }
        setClient(c);

        // Resolver conversación por SID o uniqueName (reintenta si aún no somos participantes)
        const maxTries = 6;
        const delayMs = 1200;
        let attempt = 0;
        let convo = null;

        while (!cancelled && attempt < maxTries) {
          try {
            try {
              convo = await c.getConversationBySid(conversationIdOrUniqueName);
            } catch {
              convo = await c.getConversationByUniqueName(conversationIdOrUniqueName);
            }
            if (convo) break;
          } catch (err) {
            const msg = String(err?.message || '').toLowerCase();
            const forbidden = msg.includes('forbidden') || msg.includes('401') || msg.includes('403');
            if (!forbidden) {
              console.error('Conversation lookup error', err);
              break;
            }
            await new Promise((r) => setTimeout(r, delayMs));
            attempt++;
          }
        }

        if (!cancelled) {
          if (convo) {
            setConversation(convo);
          } else {
            console.error('Conversation not found or not joined yet');
          }
        }
      } catch (e) {
        console.error('[ChatWidget] init error', e);
      }
    })();

    return () => {
      cancelled = true;
      const old = clientRef.current;
      clientRef.current = null;
      try { old?.removeAllListeners?.(); old?.shutdown?.(); } catch {}
    };
    // Solo cuando cambia la conversación objetivo (no dependas de onMessageAdded/onLabel)
  }, [conversationIdOrUniqueName]);

  // Resetear mensajes al cambiar de conversación objetivo (evita reciclar estado)
  useEffect(() => {
    setMessages([]);
  }, [conversationIdOrUniqueName]);

  // Cargar historial + suscribirse a nuevos mensajes (1 solo listener por conversación)
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await conversation.getMessages();
        if (!cancelled) setMessages(page.items);
      } catch (e) {
        console.error('getMessages error', e);
      }
    })();

    const handler = (m) => {
      setMessages((prev) => [...prev, m]);
      // notificar al panel con la ref (para no recrear listeners)
      if (m.author !== identityRef.current) {
        try { onMessageAddedRef.current?.(conversation.sid, m); } catch {}
      }
    };
    conversation.on('messageAdded', handler);

    return () => {
      cancelled = true;
      try { conversation.off('messageAdded', handler); } catch {}
    };
  }, [conversation]);

  // Typing indicators (listeners sobre el client, limpios al cambiar client/conversation)
  useEffect(() => {
    if (!client || !conversation) return;

    const handleStart = ({ conversationSid }) => {
      if (conversationSid === conversation.sid) setIsTyping(true);
    };
    const handleEnd = ({ conversationSid }) => {
      if (conversationSid === conversation.sid) setIsTyping(false);
    };

    client.on('typingStarted', handleStart);
    client.on('typingEnded', handleEnd);

    return () => {
      client.off('typingStarted', handleStart);
      client.off('typingEnded', handleEnd);
    };
  }, [client, conversation]);

  // Marcar leído al activar tab / focus
  useEffect(() => {
    if (!conversation) return;
    const markRead = async () => {
      try {
        // Evita 403 si aún no eres participante:
        const me = await conversation.getParticipantByIdentity?.(identityRef.current).catch(() => null);
        if (!me) return;
        await conversation.setAllMessagesRead();
      } catch (e) {
        console.warn('[ChatWidget] markRead skipped:', e?.message || e);
      }
    };
    if (isActive) markRead();
    const onFocus = () => { if (isActive) markRead(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [conversation, isActive]);

  // Calcular y propagar "label" sin bucles de render
  const lastLabelRef = useRef('');
  useEffect(() => {
    if (!conversation) return;
    let mounted = true;

    (async () => {
      try {
        const attrs =
          typeof conversation.attributes === 'string'
            ? (conversation.attributes ? JSON.parse(conversation.attributes) : {})
            : (conversation.attributes || {});

        let label = attrs.title || conversation.friendlyName || '';

        if (!label) {
          const participants = await conversation.getParticipants();
          label = participants
            .map((p) => {
              const pa =
                typeof p.attributes === 'string'
                  ? (p.attributes ? JSON.parse(p.attributes) : {})
                  : (p.attributes || {});
              return pa.friendlyName || p.identity;
            })
            .filter(Boolean)
            .join(', ');
        }

        if (mounted && label && label !== lastLabelRef.current) {
          lastLabelRef.current = label;
          try { onLabelRef.current?.(label); } catch {}
        }
      } catch (e) {
        console.error('conversation info error', e);
      }
    })();

    return () => { mounted = false; };
  }, [conversation]);

  // Autoscroll al final
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Habilitar/flag de video (cliente + servidor)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!VIDEO_FLAG) { if (mounted) setVideoFeatureEnabled(false); return; }
      try {
        const r = await fetch(`${API_BASE}/video/enabled`);
        const data = await r.json().catch(() => ({}));
        if (!mounted) return;
        setVideoFeatureEnabled(!!data.enabled);
      } catch {
        if (mounted) setVideoFeatureEnabled(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const send = async () => {
    if (!conversation || !text.trim()) return;
    await conversation.sendMessage(text.trim());
    setText('');
  };

  // --- Video actions ---
  // --- Video actions ---
  const startVideo = async () => {
    try {
      if (!conversation) return;

      // 0) Asegura que tenemos identidad del agente
      if (!identityRef.current) {
        // refresca token de chat para rellenar identityRef.current
        await fetchToken().catch(() => {});
      }

      // 1) Asegura sala por conversación
      const r = await fetch(`${API_BASE}/video/ensure-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationSid: conversation.sid }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`ensure-room failed: ${r.status} ${t}`);
      }
      const data = await r.json();
      const rn = data.roomName;
      setVideoRoomName(rn);

      // 2) Asegura que el AGENTE es participante de la Conversation (idempotente)
      try {
        const joinRes = await fetch(`${API_BASE}/conversations/${conversation.sid}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'chat',
            identity: identityRef.current, // e.g. "agent:42" (sin "client:")
            attributes: { role: 'agent' },
          }),
        });
        if (!joinRes.ok && joinRes.status !== 409) {
          const err = await joinRes.json().catch(() => ({}));
          // 50433 = Already in Conversation
          if (err?.error?.code !== 50433) {
            throw new Error(`join failed: ${joinRes.status} ${JSON.stringify(err)}`);
          }
        }
      } catch (e) {
        // no bloqueante: si ya estábamos unidos o hay carreras, seguimos
        console.warn('[video] ensure agent participant skipped:', e?.message || e);
      }

      // 3) Token de agente (requireAuth cookie) — ahora sí debe pasar assertParticipant
      const tokRes = await fetch(
        `${API_BASE}/video/token?roomName=${encodeURIComponent(rn)}`,
        { credentials: 'include' }
      );
      if (!tokRes.ok) {
        const t = await tokRes.text().catch(() => '');
        throw new Error(`video token failed: ${tokRes.status} ${t}`);
      }
      const { token } = await tokRes.json();

      // 4) Conectar
      await connect({ token, roomName: rn });
      setVideoOpen(true);

      // 5) Mensaje de sistema (no bloqueante)
      try { await conversation.sendMessage('[system] Video call started'); } catch {}
    } catch (e) {
      console.error('startVideo failed', e);
      alert('No se pudo iniciar la videollamada.');
    }
  };


  const endVideo = async () => {
    try {
      await disconnect();
    } finally {
      setVideoOpen(false);
      setVideoRoomName('');
      try { await conversation?.sendMessage('[system] Video call ended'); } catch {}
    }
  };

  return (
    <Box
      className={styles.container}
      borderStyle="solid"
      borderColor="colorBorderWeaker"
      borderWidth="borderWidth10"
      borderRadius="borderRadius30"
      padding="space60"
    >
      <Heading as="h3" variant="heading30" marginBottom="space50">
        Support Chat
      </Heading>

      {/* Panel de Video (visible cuando está activo) */}
      {videoFeatureEnabled && videoOpen && (
        <Box marginBottom="space60">
          <VideoPanel room={room} participants={participants} onClose={endVideo} />
        </Box>
      )}

      {/* Chat log */}
      <Box
        className={styles.log}
        overflowY="auto"
        backgroundColor="colorBackground"
        padding="space50"
        borderRadius="borderRadius20"
        marginBottom="space50"
      >
        <ChatLog>
          {messages.map((m) => (
            <ChatMessage
              key={m.sid}
              variant={m.author === identityRef.current ? 'outbound' : 'inbound'}
            >
              <ChatBubble>
                <Text as="p">{m.body}</Text>
              </ChatBubble>
              <ChatMessageMeta>
                <ChatMessageMetaItem>
                  <Text as="span" color="colorTextWeak" fontSize="fontSize20">
                    {m.author || 'system'}
                  </Text>
                </ChatMessageMetaItem>
              </ChatMessageMeta>
            </ChatMessage>
          ))}
          <Box ref={bottomRef} />
        </ChatLog>
      </Box>

      {isTyping && (
        <Text as="p" color="colorTextWeak" fontSize="fontSize20" marginBottom="space50">
          Typing...
        </Text>
      )}

      {/* Composer + acciones */}
      <Box display="flex" columnGap="space50">
        <Box flexGrow={1}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe..."
          />
        </Box>

        <Button variant="primary" onClick={send}>
          Enviar
        </Button>

        {videoFeatureEnabled && (
          <Button
            variant={videoOpen ? 'secondary' : 'primary'}
            onClick={videoOpen ? endVideo : startVideo}
            disabled={!conversation || connecting}
            title={videoOpen ? 'Finalizar videollamada' : 'Iniciar videollamada'}
          >
            {/* Ícono mínimo garantizado */}
            <span aria-hidden="true" style={{ marginRight: 6 }}>🎥</span>
            {videoOpen ? 'Colgar' : 'Video'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
