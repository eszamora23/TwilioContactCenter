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
import styles from './ChatWidget.module.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

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

  // Mantener refs para callbacks inestables (no usarlas como deps de efectos con listeners)
  const onMessageAddedRef = useRef(onMessageAdded);
  const onLabelRef = useRef(onLabel);
  useEffect(() => { onMessageAddedRef.current = onMessageAdded; }, [onMessageAdded]);
  useEffect(() => { onLabelRef.current = onLabel; }, [onLabel]);

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
          try { c.removeAllListeners?.(); c.shutdown?.(); } catch { }
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
      try { old?.removeAllListeners?.(); old?.shutdown?.(); } catch { }
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
        try { onMessageAddedRef.current?.(conversation.sid, m); } catch { }
      }
    };
    conversation.on('messageAdded', handler);

    return () => {
      cancelled = true;
      try { conversation.off('messageAdded', handler); } catch { }
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
          try { onLabelRef.current?.(label); } catch { }
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

  const send = async () => {
    if (!conversation || !text.trim()) return;
    await conversation.sendMessage(text.trim());
    setText('');
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
      </Box>
    </Box>
  );
}
