import { bus } from '../services/bus.js';
import { byId, scrollToBottom } from './dom.js';
import { SessionStore } from '../services/session.store.js';

function getMessagesEl() { return byId('messages'); }

function appendMessage(author, body){
  const el = getMessagesEl();
  if (!el) return;
  const li = document.createElement('li');
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (author === (SessionStore.identity || 'me') ? ' me' : '');
  bubble.textContent = body || '';
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  if (author === SessionStore.identity) { li.appendChild(time); li.appendChild(bubble); }
  else { li.appendChild(bubble); li.appendChild(time); }
  el.appendChild(li);
  scrollToBottom(el);
}

bus.on('messages:reset', (items=[]) => {
  const el = getMessagesEl();
  if (!el) return;
  el.innerHTML = '';
  items.forEach(m => appendMessage(m.author || 'system', m.body || ''));
});
bus.on('messages:added', (m) => appendMessage(m.author || 'system', m.body || ''));
bus.on('messages:echo',  (m) => appendMessage(m.author || 'me',     m.body || ''));
bus.on('chat:ended', () => {
  const el = getMessagesEl();
  if (el) el.innerHTML = '';
});
