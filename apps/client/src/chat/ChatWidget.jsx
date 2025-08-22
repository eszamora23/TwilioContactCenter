import { useEffect, useState, useMemo } from 'react';
import { Client as ConversationsClient } from '@twilio/conversations';


export default function ChatWidget({ conversationIdOrUniqueName }) {
const [client, setClient] = useState(null);
const [conversation, setConversation] = useState(null);
const [messages, setMessages] = useState([]);
const [text, setText] = useState('');


// bootstrap SDK
useEffect(() => {
let mounted = true;
(async () => {
const r = await fetch('/api/chat/token');
const { token } = await r.json();
const c = await ConversationsClient.create(token);
if (!mounted) return;
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
<div style={{display:'flex', gap:8}}>
<input value={text} onChange={e=>setText(e.target.value)} placeholder="Escribe..."
style={{flex:1, padding:'8px 10px', border:'1px solid #ccc', borderRadius:6}} />
<button onClick={send} style={{padding:'8px 12px', borderRadius:6}}>Enviar</button>
</div>
</div>
);
}