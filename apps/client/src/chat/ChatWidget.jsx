// src/chat/ChatWidget.jsx
import { useEffect, useState, useRef, useMemo } from 'react';
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
import { Separator } from '@twilio-paste/core/separator';
import Video from 'twilio-video';
import styles from './ChatWidget.module.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const VIDEO_FLAG = String(import.meta.env.VITE_VIDEO_ENABLED || 'false').toLowerCase() === 'true';

/* ============ Video helpers (inline) ============ */
function useVideoRoom() {
  const roomRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => () => { try { roomRef.current?.disconnect(); } catch {} }, []);

  const connect = async ({ token, roomName }) => {
    if (!token || !roomName || roomRef.current) return;
    setConnecting(true);
    const r = await Video.connect(token, { name: roomName, audio: true, video: { width: 640 } });
    roomRef.current = r;
    setRoom(r);
    const list = () => Array.from(r.participants.values());
    setParticipants(list());
    const onJoin = () => setParticipants(list());
    const onLeave = () => setParticipants(list());
    const onRoomDown = () => { setParticipants([]); setRoom(null); roomRef.current = null; };
    r.on('participantConnected', onJoin);
    r.on('participantDisconnected', onLeave);
    r.on('disconnected', onRoomDown);
    setConnecting(false);
  };

  const disconnect = async () => {
    try { roomRef.current?.disconnect(); } finally { roomRef.current = null; setRoom(null); setParticipants([]); }
  };

  return { room, participants, connecting, connect, disconnect };
}

/* Helpers de formato */
const isSystem = (m) =>
  String(m.author || '').toLowerCase() === 'system' || /^\[system]/i.test(m.body || '');
const sameDay = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString();
const timeFmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ============ ChatWidget ============ */
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
  const bottomRef = useRef(null);
  const logRef = useRef(null);

  // typing UI
  const [isTyping, setIsTyping] = useState(false);

  // video
  const [videoFeatureEnabled, setVideoFeatureEnabled] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const { room, participants, connecting, connect, disconnect } = useVideoRoom();

  // scroll helpers
  const [atBottom, _setAtBottom] = useState(true);
  const atBottomRef = useRef(true);                 // <- fuente de verdad para autoseguimiento
  const setAtBottom = (v) => { atBottomRef.current = v; _setAtBottom(v); };
  const [pendingUnread, setPendingUnread] = useState(0);

  // popup?
  const isPopup =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('popup') === 'chat';

  const onMessageAddedRef = useRef(onMessageAdded);
  const onLabelRef = useRef(onLabel);
  useEffect(() => { onMessageAddedRef.current = onMessageAdded; }, [onMessageAdded]);
  useEffect(() => { onLabelRef.current = onLabel; }, [onLabel]);

  /* Token Conversations */
  const fetchToken = async () => {
    const url = identityRef.current
      ? `${API_BASE}/chat/refresh?identity=${encodeURIComponent(identityRef.current)}`
      : `${API_BASE}/chat/token`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`chat token failed: ${r.status}`);
    const data = await r.json();
    if (data.identity) identityRef.current = data.identity;
    return data.token;
  };

  /* Bootstrap */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await fetchToken();
        const c = new ConversationsClient(token);
        clientRef.current = c;

        const refresh = async () => {
          try { await c.updateToken(await fetchToken()); } catch (e) { console.error('[ChatWidget] token refresh', e); }
        };
        c.on('tokenAboutToExpire', refresh);
        c.on('tokenExpired', refresh);

        if (cancelled) { try { c.removeAllListeners?.(); c.shutdown?.(); } catch {}; return; }
        setClient(c);

        let convo = null;
        const maxTries = 6, delayMs = 1200;
        for (let i = 0; i < maxTries && !convo && !cancelled; i++) {
          try { convo = await c.getConversationBySid(conversationIdOrUniqueName); }
          catch { try { convo = await c.getConversationByUniqueName(conversationIdOrUniqueName); } catch {} }
          if (!convo) await new Promise(r => setTimeout(r, delayMs));
        }
        if (!cancelled) convo ? setConversation(convo) : console.error('Conversation not found or not joined yet');
      } catch (e) {
        console.error('[ChatWidget] init error', e);
      }
    })();

    return () => {
      cancelled = true;
      const old = clientRef.current; clientRef.current = null;
      try { old?.removeAllListeners?.(); old?.shutdown?.(); } catch {}
    };
  }, [conversationIdOrUniqueName]);

  // Reset list when target changes
  useEffect(() => { setMessages([]); setPendingUnread(0); }, [conversationIdOrUniqueName]);

  // Load history + subscribe to updates (handler estable: usa atBottomRef)
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await conversation.getMessages();
        if (!cancelled) setMessages(page.items);
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }));
      } catch (e) { console.error('getMessages error', e); }
    })();

    const handler = (m) => {
      const wasAtBottom = atBottomRef.current; // snapshot estable
      setMessages((prev) => [...prev, m]);

      const inbound = m.author !== identityRef.current && !isSystem(m);
      if (inbound && !wasAtBottom) setPendingUnread((x) => x + 1);

      if (wasAtBottom) {
        // solo seguimos si el usuario ya estaba abajo
        requestAnimationFrame(() =>
          bottomRef.current?.scrollIntoView({ behavior: 'auto' })
        );
      }

      if (m.author !== identityRef.current) {
        try { onMessageAddedRef.current?.(conversation.sid, m); } catch {}
      }
    };

    conversation.on('messageAdded', handler);
    return () => { cancelled = true; try { conversation.off('messageAdded', handler); } catch {} };
  }, [conversation]); // <- NO dependemos de atBottom

  /* Typing UI */
  useEffect(() => {
    if (!client || !conversation) return;
    const start = ({ conversationSid }) => { if (conversationSid === conversation.sid) setIsTyping(true); };
    const end   = ({ conversationSid }) => { if (conversationSid === conversation.sid) setIsTyping(false); };
    client.on('typingStarted', start);
    client.on('typingEnded', end);
    return () => { client.off('typingStarted', start); client.off('typingEnded', end); };
  }, [client, conversation]);

  /* Mark read on focus / active */
  useEffect(() => {
    if (!conversation) return;
    const markRead = async () => {
      try {
        const me = await conversation.getParticipantByIdentity?.(identityRef.current).catch(() => null);
        if (!me) return;
        await conversation.setAllMessagesRead();
        setPendingUnread(0);
      } catch {}
    };
    if (isActive) markRead();
    const onFocus = () => { if (isActive) markRead(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [conversation, isActive]);

  /* Derive label for tabs once */
  useEffect(() => {
    if (!conversation) return;
    let mounted = true;
    (async () => {
      try {
        const attrs = typeof conversation.attributes === 'string'
          ? (conversation.attributes ? JSON.parse(conversation.attributes) : {})
          : (conversation.attributes || {});
        let label = attrs.title || conversation.friendlyName || '';
        if (!label) {
          const participants = await conversation.getParticipants();
          label = participants
            .map((p) => {
              const pa = typeof p.attributes === 'string' ? (p.attributes ? JSON.parse(p.attributes) : {}) : (p.attributes || {});
              return pa.friendlyName || p.identity;
            })
            .filter(Boolean)
            .join(', ');
        }
        if (mounted && label) onLabelRef.current?.(label);
      } catch (e) { console.error('conversation info error', e); }
    })();
    return () => { mounted = false; };
  }, [conversation]);

  /* Detectar “en el fondo” de manera robusta (IntersectionObserver) */
  useEffect(() => {
    const root = logRef.current;
    const sentinel = bottomRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = !!entries[0]?.isIntersecting;
        setAtBottom(vis);
      },
      { root, threshold: 1.0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  /* Además, escucha el scroll para limpiar el contador si vuelves al fondo */
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
      setAtBottom(nearBottom);
      if (nearBottom && pendingUnread) setPendingUnread(0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pendingUnread]);

  /* Video flag */
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!VIDEO_FLAG) { if (mounted) setVideoFeatureEnabled(false); return; }
      try {
        const r = await fetch(`${API_BASE}/video/enabled`);
        const data = await r.json().catch(() => ({}));
        if (!mounted) return;
        setVideoFeatureEnabled(!!data.enabled);
      } catch { if (mounted) setVideoFeatureEnabled(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const send = async () => {
    const val = text.trim();
    if (!conversation || !val) return;
    await conversation.sendMessage(val);
    setText('');
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  /* Video actions */
  const startVideo = async () => {
    try {
      if (!conversation) return;
      if (!identityRef.current) await fetchToken().catch(() => {});
      const ensure = await fetch(`${API_BASE}/video/ensure-room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationSid: conversation.sid }),
      });
      if (!ensure.ok) throw new Error(`ensure-room failed: ${ensure.status}`);
      const { roomName } = await ensure.json();

      try {
        const joinRes = await fetch(`${API_BASE}/conversations/${conversation.sid}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'chat', identity: identityRef.current, attributes: { role: 'agent' } }),
        });
        if (!joinRes.ok && joinRes.status !== 409) {
          const err = await joinRes.json().catch(() => ({}));
          if (err?.error?.code !== 50433) throw new Error('join failed');
        }
      } catch {}

      const tokRes = await fetch(`${API_BASE}/video/token?roomName=${encodeURIComponent(roomName)}`, { credentials: 'include' });
      if (!tokRes.ok) throw new Error(`video token failed: ${tokRes.status}`);
      const { token } = await tokRes.json();

      await connect({ token, roomName });
      setVideoOpen(true);
      try { await conversation.sendMessage('[system] Video call started'); } catch {}
    } catch (e) {
      console.error('startVideo failed', e);
      alert('Could not start the video call.');
    }
  };

  const endVideo = async () => {
    try { await disconnect(); } finally {
      setVideoOpen(false);
      try { await conversation?.sendMessage('[system] Video call ended'); } catch {}
    }
  };

  /* Grouping bonito: por día y por autor */
  const pretty = useMemo(() => {
    const out = []; let prev = null;
    for (const m of messages) {
      const ts = m.dateCreated || m.dateUpdated || Date.now();
      if (!prev || !sameDay(prev?.ts, ts)) out.push({ kind: 'day', ts });
      const author = m.author || 'system';
      const startGroup = !prev || prev.author !== author || Math.abs(ts - prev.ts) > 2 * 60 * 1000;
      out.push({ kind: 'msg', startGroup, m, ts, author });
      prev = { ts, author };
    }
    return out;
  }, [messages]);

  /* Shell */
  const rootClass = [styles.container, isPopup ? styles.fullscreen : ''].join(' ').trim();

  return (
    <Box className={rootClass}>
      <Box className={styles.card}>
        {/* Título solo en popup */}
        {isPopup && (
          <Heading as="h3" variant="heading30" marginBottom="space50">
            Support Chat
          </Heading>
        )}

        <Box className={styles.body}>
          {/* VIDEO (opcional) */}
          {videoFeatureEnabled && videoOpen && (
            <Box className={`${styles.videoWrap} ${styles.videoClamp}`}>
              <Box className={styles.videoGrid}>
                <VideoLocalAndRemotes room={room} participants={participants} />
              </Box>
              <Box marginTop="space60">
                <Button variant="destructive" onClick={endVideo}>End video</Button>
              </Box>
            </Box>
          )}

          {/* CHAT LOG con scroll interno */}
          <Box ref={logRef} className={styles.log}>
            {!atBottom && <div className={styles.fadeTop} />}
            <div className={styles.fadeBottom} />

            <ChatLog>
              {pretty.map((it, idx) => {
                if (it.kind === 'day') {
                  const d = new Date(it.ts);
                  const label = d.toLocaleDateString(undefined, {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                  });
                  return (
                    <Box
                      key={`day-${idx}`}
                      marginY="space50"
                      display="grid"
                      gridTemplateColumns="1fr auto 1fr"
                      alignItems="center"
                      columnGap="space50"
                    >
                      <Separator orientation="horizontal" />
                      <span className={styles.dayChip}>{label}</span>
                      <Separator orientation="horizontal" />
                    </Box>
                  );
                }

                const m = it.m;
                const outbound = m.author === identityRef.current;
                const system = isSystem(m);

                if (system) {
                  return (
                    <Box key={m.sid || `${m.index}-sys`} marginBottom="space30">
                      <span className={styles.system}>
                        {m.body?.replace(/^\[system]\s*/i, '') || 'system'}
                      </span>
                    </Box>
                  );
                }

                return (
                  <ChatMessage key={m.sid || m.index} variant={outbound ? 'outbound' : 'inbound'}>
                    <ChatBubble className={styles.bubble}>
                      <Text as="p">{m.body}</Text>
                    </ChatBubble>

                    {it.startGroup && (
                      <ChatMessageMeta>
                        <ChatMessageMetaItem>
                          <Text as="span" color="colorTextWeak" fontSize="fontSize20">
                            {m.author || 'user'}
                          </Text>
                        </ChatMessageMetaItem>
                        <ChatMessageMetaItem>
                          <Text as="span" color="colorTextWeaker" fontSize="fontSize20">
                            {timeFmt(m.dateCreated || Date.now())}
                          </Text>
                        </ChatMessageMetaItem>
                      </ChatMessageMeta>
                    )}
                  </ChatMessage>
                );
              })}
              <Box ref={bottomRef} />
            </ChatLog>

            {/* Botón flotante para volver al final */}
            {!atBottom && (
              <button
                className={styles.jump}
                onClick={() => {
                  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setPendingUnread(0);
                }}
                type="button"
                aria-label="Jump to latest"
                title="Jump to latest"
              >
                ↓ New messages
                {pendingUnread > 0 && <span className={styles.jumpCount}>{pendingUnread}</span>}
              </button>
            )}
          </Box>

          {/* Typing */}
          {isTyping && (
            <Text as="p" color="colorTextWeak" fontSize="fontSize20">
              Typing…
            </Text>
          )}

          {/* COMPOSER (sticky) */}
          <Box className={styles.composerRow}>
            <Box flexGrow={1}>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Type a message…"
                aria-label="Type a message"
              />
            </Box>

            <Button variant="primary" onClick={send}>Send</Button>

            {videoFeatureEnabled && (
              <Button
                variant={videoOpen ? 'secondary' : 'primary'}
                onClick={videoOpen ? endVideo : startVideo}
                disabled={!conversation || connecting}
                title={videoOpen ? 'End video call' : 'Start video call'}
              >
                <span aria-hidden="true" style={{ marginRight: 6 }}>🎥</span>
                {videoOpen ? 'Hang up' : 'Video'}
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* Local + Remotos (video) */
function VideoLocalAndRemotes({ room, participants }) {
  const localRef = useRef(null);
  useEffect(() => {
    if (!room) return;
    const local = room.localParticipant;
    local.tracks.forEach((pub) => {
      const track = pub.track;
      if (!track || !localRef.current) return;
      if (localRef.current.querySelector(`[data-track-sid="${track.sid}"]`)) return;
      const el = track.attach();
      el.dataset.trackSid = track.sid;
      localRef.current.appendChild(el);
    });
    return () => {
      try { local.tracks.forEach((pub) => pub.track?.detach()?.forEach((el) => el.remove())); } catch {}
    };
  }, [room]);

  return (
    <>
      <Box className={`${styles.videoLocal} ${styles.videoSurface}`}>
        <h4 style={{ marginTop: 0 }}>You</h4>
        <div ref={localRef} />
      </Box>
      {participants.map((p) => (
        <RemoteParticipant key={p.sid} participant={p} />
      ))}
    </>
  );
}

function RemoteParticipant({ participant }) {
  const holder = useRef(null);
  useEffect(() => {
    if (!participant) return;
    const attachTrack = (track) => {
      if (!track || !holder.current) return;
      if (holder.current.querySelector(`[data-track-sid="${track.sid}"]`)) return;
      const el = track.attach();
      el.dataset.trackSid = track.sid;
      holder.current.appendChild(el);
    };
    const detachTrack = (track) => { try { track?.detach()?.forEach((el) => el.remove()); } catch {} };
    participant.tracks.forEach((pub) => {
      if (pub.track) attachTrack(pub.track);
      pub.on?.('subscribed', attachTrack);
      pub.on?.('unsubscribed', detachTrack);
    });
    const onTrackSubscribed = (track) => attachTrack(track);
    const onTrackUnsubscribed = (track) => detachTrack(track);
    participant.on('trackSubscribed', onTrackSubscribed);
    participant.on('trackUnsubscribed', onTrackUnsubscribed);
    return () => {
      participant.off('trackSubscribed', onTrackSubscribed);
      participant.off('trackUnsubscribed', onTrackUnsubscribed);
      participant.tracks.forEach((pub) => {
        pub.off?.('subscribed', attachTrack);
        pub.off?.('unsubscribed', detachTrack);
        detachTrack(pub.track);
      });
    };
  }, [participant]);

  return (
    <Box className={`${styles.videoRemote} ${styles.videoSurface}`}>
      <h4 style={{ marginTop: 0 }}>{participant.identity || 'Remote'}</h4>
      <div ref={holder} />
    </Box>
  );
}
