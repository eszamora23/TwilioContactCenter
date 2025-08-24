import { byId, show, hide } from './dom.js';
import { toast } from './toast.js';
import { bus } from '../services/bus.js';
import { SessionStore } from '../services/session.store.js';
import { API_BASE } from '../services/config.js';
import { attachPreviewTracks } from './video.view.js';

export function initFormsUI({ chat, video }){
  const startForm     = byId('start-form');
  const chatContainer = byId('chat-container');
  const messageForm   = byId('message-form');
  const messageInput  = byId('message-input');
  const startVideoBtn = byId('start-video');
  const endVideoBtn   = byId('end-video');
  const endChatBtn    = byId('end-chat');
  const copyBtn       = byId('copy-transcript');

  // Prefill name/email
  const nameEl  = byId('name');
  const emailEl = byId('email');
  if (nameEl && SessionStore.name)   nameEl.value  = SessionStore.name;
  if (emailEl && SessionStore.email) emailEl.value = SessionStore.email;

  let currentSid = null;

  // Start form
  startForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name  = (byId('name')?.value || '').trim();
    const email = (byId('email')?.value || '').trim().toLowerCase();

    try {
      SessionStore.name = name;
      SessionStore.email = email;

      const convo = await chat.startNew({ name, email });
      if (!convo) { alert('Could not open the conversation yet. Please retry.'); return; }

      // Set our local sid immediately (don’t wait only on bus)
      currentSid = convo.sid;

      // Seed message (non-blocking)
      fetch(`${API_BASE}/api/conversations/${convo.sid}/messages`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ author: 'system', body: 'Thanks! An agent will join shortly.' })
      }).catch(()=>{});
    } catch (err) {
      console.error(err);
      alert('Unexpected error starting chat.');
    }
  });

  // Send message
  messageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = (messageInput?.value || '').trim();
    if (!body || !currentSid) return;
    try {
      await chat.send(body);
      if (messageInput) messageInput.value = '';
    } catch (err) {
      console.error('sendMessage failed', err);
    }
  });

  // Video start/stop
  startVideoBtn?.addEventListener('click', async () => {
    if (!currentSid) { toast('Open the chat first'); return; }
    try { await video.start(currentSid, attachPreviewTracks); } catch (e) {
      console.error('[webchat] startVideo failed:', e);
      alert('Could not start the video call. Check console and server vars.');
    }
  });
  endVideoBtn?.addEventListener('click', () => {
    try { video.end(); } catch {}
  });

  // End chat
  endChatBtn?.addEventListener('click', async () => {
    try { video.end(); } catch {}
    await chat.end();      // emits chat:ended
    currentSid = null;     // also drop our local copy
  });

  // Copy transcript
  copyBtn?.addEventListener('click', async () => {
    const nodes = document.querySelectorAll('#messages li .bubble, #messages li .time');
    const lines = [];
    let current = '';
    nodes.forEach(n => {
      if (n.classList.contains('time')) current = `[${n.textContent}] `;
      else { lines.push(`${current}${n.textContent}`); current = ''; }
    });
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Copied'); } catch {}
  });

  // BUS → UI
  bus.on('chat:ready', ({ sid }) => {
    currentSid = sid;
    hide(startForm);
    show(chatContainer);
  });

  bus.on('video:feature', ({ enabled }) => {
    const btn = byId('start-video');
    if (btn) (enabled ? show(btn) : hide(btn));
  });

  bus.on('chat:ended', () => {
    currentSid = null;
    show(startForm);
    hide(chatContainer);
    toast('Chat ended');
  });
}
