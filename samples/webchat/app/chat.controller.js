import { SessionStore } from '../services/session.store.js';
import { ConversationsService } from '../services/conversations.service.js';
import { fetchGuestToken } from '../services/token.service.js';
import { API_BASE } from '../services/config.js';
import { bus } from '../services/bus.js';

export class ChatController {
  convo = null;
  svc = new ConversationsService();

  async resumeOrStart(storedSid) {
    await this.svc.init();
    const sid = storedSid || SessionStore.convoSid;
    if (!sid) return null;

    const convo = await this.svc.getConversationBySidWithRetry(sid);
    if (!convo) return null;

    this.convo = convo;
    SessionStore.convoSid = this.convo.sid;

    // Cargar recientes
    try {
      const page = await this.convo.getMessages();
      bus.emit('messages:reset', page.items);
    } catch (e) {
      console.warn('Failed to load message history', e);
    }

    // Eventos de mensajes
    this.convo.on('messageAdded', (msg) => bus.emit('messages:added', msg));

    // Mostrar UI de chat
    bus.emit('chat:ready', { sid: this.convo.sid });

    // Feature flag de video
    try {
      const r = await fetch(`${API_BASE}/api/video/enabled`);
      const data = await r.json().catch(()=> ({}));
      bus.emit('video:feature', { enabled: !!data?.enabled });
    } catch {
      bus.emit('video:feature', { enabled: false });
    }

    return this.convo;
  }

  async startNew({ name, email }) {
    // 1) Guest token (setea identity si es necesario)
    await fetchGuestToken();

    // 2) Crear/fetch conversación
    const convoRes = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uniqueName: email, friendlyName: name || email, attributes: { name, email }
      })
    });
    if (!convoRes.ok) {
      const txt = await convoRes.text().catch(()=> '');
      throw new Error(`Failed to create conversation: ${txt}`);
    }
    const convoData = await convoRes.json();

    // 3) Asegurar participant membership
    try {
      const addRes = await fetch(`${API_BASE}/api/conversations/${convoData.sid}/participants`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          type:'chat',
          identity: SessionStore.identity,
          attributes: { name, email, role:'guest' }
        })
      });
      if (!addRes.ok && addRes.status !== 409) {
        const errData = await addRes.json().catch(()=> ({}));
        if (errData.error?.code !== 50433) {
          const e = new Error(errData.error?.message || 'Failed to add participant');
          e.status = addRes.status; e.code = errData.error?.code;
          throw e;
        }
      }
    } catch (err) {
      if (err.status !== 409 && err.code !== 50433) throw err;
    }

    // 4) Abrir conversación
    return this.resumeOrStart(convoData.sid);
  }

  async send(body) {
    if (!this.convo || !body) return;
    await this.convo.sendMessage(body);
    bus.emit('messages:echo', { author: SessionStore.identity || 'me', body });
  }

  async end() {
    try { await this.convo?.leave?.(); } catch (e) { console.warn('leave() failed or unsupported', e); }
    try {
      if (this.convo?.sid) {
        fetch(`${API_BASE}/api/conversations/${this.convo.sid}/close`, { method: 'POST' }).catch(()=>{});
      }
    } catch {}
    this.convo = null;
    SessionStore.clearExceptProfile();
    bus.emit('chat:ended');
  }
}
