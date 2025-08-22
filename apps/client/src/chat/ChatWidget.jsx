import { useEffect, useState, useRef } from 'react';
import { Client as ConversationsClient } from '@twilio/conversations';

export default function ChatWidget({ conversationIdOrUniqueName }) {
  const [client, setClient] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const identityRef = useRef();
  const [isTyping, setIsTyping] = useState(false);


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


const send = async () => {
if (!conversation || !text.trim()) return;
await conversation.sendMessage(text.trim());
setText('');
};


return (
<div className="twcc-chat" style={{border:'1px solid #ddd', borderRadius:8, padding:12, width:360, fontFamily:'system-ui'}}>
<div style={{fontWeight:600, marginBottom:8}}>Support Chat</div>
<div style={{height:260, overflowY:'auto', background:'#fafafa', padding:8, borderRadius:6, marginBottom:8}}>
{messages.map(m => (
<div key={m.sid} style={{margin:'6px 0'}}>
<div style={{fontSize:12, color:'#555'}}>{m.author || 'system'}</div>
<div>{m.body}</div>
</div>
))}
</div>
{isTyping && <div style={{fontSize:12, color:'#999', marginBottom:8}}>Typing...</div>}
<div style={{display:'flex', gap:8}}>
<input value={text} onChange={e=>setText(e.target.value)} placeholder="Escribe..."
style={{flex:1, padding:'8px 10px', border:'1px solid #ccc', borderRadius:6}} />
<button onClick={send} style={{padding:'8px 12px', borderRadius:6}}>Enviar</button>
</div>
</div>
);
}