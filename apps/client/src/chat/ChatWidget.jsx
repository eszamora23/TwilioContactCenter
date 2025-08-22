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

export default function ChatWidget({ conversationIdOrUniqueName }) {
  const [client, setClient] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const identityRef = useRef();
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);


  const fetchToken = async () => {
    const url = identityRef.current
      ? `/api/chat/refresh?identity=${encodeURIComponent(identityRef.current)}`
      : '/api/chat/token';
    const r = await fetch(url);
    const data = await r.json();
    if (data.identity) identityRef.current = data.identity;
    return data.token;
  };

  // bootstrap SDK
  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = await fetchToken();
      const c = await ConversationsClient.create(token);
      if (!mounted) return;
      const refresh = async () => {
        const newToken = await fetchToken();
        await c.updateToken(newToken);
      };
      c.on('tokenAboutToExpire', refresh);
      c.on('tokenExpired', refresh);
      setClient(c);
      try {
        let convo = await c.getConversationBySid(conversationIdOrUniqueName);
        setConversation(convo);
      } catch (e) {
        try {
          const convo = await c.getConversationByUniqueName(conversationIdOrUniqueName);
          setConversation(convo);
        } catch (err) {
          console.error('Conversation not found; ensure server created it first');
        }
      }
    })();
    return () => { mounted = false; client?.shutdown?.(); };
  }, [conversationIdOrUniqueName]);


// load history & subscribe to new messages
useEffect(() => {
if (!conversation) return;
(async () => {
const page = await conversation.getMessages();
setMessages(page.items);
conversation.on('messageAdded', (m) => setMessages((prev) => [...prev, m]));
})();
}, [conversation]);

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

useEffect(() => {
if (!conversation) return;
const markRead = () => {
try { conversation.setAllMessagesRead(); } catch {}
};
markRead();
window.addEventListener('focus', markRead);
return () => window.removeEventListener('focus', markRead);
}, [conversation]);


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