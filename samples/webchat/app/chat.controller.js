import { SessionStore } from '../services/session.store.js';
import { ConversationsService } from '../services/conversations.service.js';
import { fetchGuestToken } from '../services/token.service.js';
import { API_BASE } from '../services/config.js';
import { bus } from '../services/bus.js';

export class ChatController {
  convo = null;
  svc = new ConversationsService();
  _seenMsgIds = new Set();

  async resumeOrStart(storedSid) {
    await this.svc.init();
    const sid = storedSid || SessionStore.convoSid;
    if (!sid) return null;

    const convo = await this.svc.getConversationBySidWithRetry(sid);
    if (!convo) {
      // <- Conversación inválida (ej. 403 “not participant”): limpia el SID
      try { SessionStore.convoSid = null; } catch {}
      return null;
    }

    this.convo = convo;
    SessionStore.convoSid = this.convo.sid;

    // Cargar recientes
    try {
      const page = await this.convo.getMessages();
      bus.emit('messages:reset', page.items);
    } catch (e) {
      console.warn('Failed to load message history', e);
    }

    // Eventos de mensajes (de-dupe por clientMsgId si llega)
    this.convo.on('messageAdded', (msg) => {
      const cid = msg?.attributes?.clientMsgId;
      if (cid && this._seenMsgIds.has(cid)) return;
      if (cid) this._seenMsgIds.add(cid);
      bus.emit('messages:added', msg);
    });

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
    // NO hacemos fetchGuestToken aquí: init() ya lo maneja
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

    return this.resumeOrStart(convoData.sid);
  }

  async send(body) {
    if (!this.convo || !body) return;
    const clientMsgId = (globalThis.crypto?.randomUUID?.()) || (String(Date.now()) + Math.random().toString(36).slice(2,8));
    try {
      if (this.convo.prepareMessage) {
        await this.convo.prepareMessage().setBody(body).setAttributes({ clientMsgId }).build().send();
      } else {
        await this.convo.sendMessage(body, { clientMsgId });
      }
      this._seenMsgIds.add(clientMsgId);
      bus.emit('messages:echo', { author: SessionStore.identity || 'me', body, clientMsgId });
    } catch (e) {
      // retry simple
      try {
        await new Promise(r => setTimeout(r, 300));
        await this.convo.sendMessage(body, { clientMsgId });
        this._seenMsgIds.add(clientMsgId);
        bus.emit('messages:echo', { author: SessionStore.identity || 'me', body, clientMsgId });
      } catch (err2) {
        console.error('send failed', err2);
        throw err2;
      }
    }
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
