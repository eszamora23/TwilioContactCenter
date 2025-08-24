// samples/webchat/chat.js
const API_BASE = window.API_BASE || 'http://localhost:4000';

(function () {
  // ---------- DOM ----------
  const startForm = document.getElementById('start-form');
  const chatContainer = document.getElementById('chat-container');
  const messagesEl = document.getElementById('messages');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');

  // Video UI
  const startVideoBtn = document.getElementById('start-video');
  const endVideoBtn = document.getElementById('end-video');
  const endChatBtn = document.getElementById('end-chat');
  const videoShell = document.getElementById('video-container');
  const localMedia = document.getElementById('local-media');
  const remoteMedia = document.getElementById('remote-media');

  // ---------- Local Storage Keys ----------
  const LS = {
    NAME: 'wxs_name',
    EMAIL: 'wxs_email',
    IDENTITY: 'wxs_guest_identity',
    CONVO: 'wxs_conversation_sid',
    VIDEO_ACTIVE: 'wxs_video_active',
  };

  // ---------- State ----------
  let conversation = null;
  let client = null;
  let guestIdentity = null;

  // Twilio Video room (guest)
  let videoRoom = null;

  // ---------- Helpers ----------
  function show(el) { el && el.classList.remove('hidden'); }
  function hide(el) { el && el.classList.add('hidden'); }
  function scrollToBottom() { messagesEl.lastElementChild?.scrollIntoView({ behavior: 'smooth' }); }
  function toast(text) {
    let node = document.getElementById('toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'toast';
      node.style.position = 'fixed';
      node.style.bottom = '24px';
      node.style.right = '24px';
      node.style.padding = '12px 16px';
      node.style.border = '1px solid var(--stroke)';
      node.style.borderRadius = '12px';
      node.style.background = 'var(--card)';
      node.style.color = 'var(--text)';
      node.style.boxShadow = 'var(--shadow)';
      document.body.appendChild(node);
    }
    node.textContent = text;
    node.style.opacity = '1';
    setTimeout(() => { node.style.transition = 'opacity .5s'; node.style.opacity = '0'; }, 1800);
  }

  function saveSession() {
    try {
      if (guestIdentity) localStorage.setItem(LS.IDENTITY, guestIdentity);
      if (conversation?.sid) localStorage.setItem(LS.CONVO, conversation.sid);
    } catch {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(LS.CONVO);
      localStorage.removeItem(LS.IDENTITY);
      localStorage.removeItem(LS.VIDEO_ACTIVE);
      // Keep name/email so the form stays prefilled
    } catch {}
  }

  async function fetchGuestToken() {
    const identityQs = guestIdentity ? `?identity=${encodeURIComponent(guestIdentity)}` : '';
    const url = `${API_BASE}/api/chat/${guestIdentity ? 'refresh' : 'token'}/guest${identityQs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Token error: ${res.status}`);
    const data = await res.json();
    if (data.identity) guestIdentity = data.identity; // e.g., guest:uuid
    // Persist identity so a reload restores the same session
    try { localStorage.setItem(LS.IDENTITY, guestIdentity); } catch {}
    return data.token;
  }

  function appendMessage(author, body) {
    const li = document.createElement('li');
    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (author === guestIdentity ? ' me' : '');
    bubble.textContent = body || '';
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (author === guestIdentity) { li.appendChild(time); li.appendChild(bubble); }
    else { li.appendChild(bubble); li.appendChild(time); }
    messagesEl.appendChild(li);
    scrollToBottom();
  }

  function attachLocalTracks(room) {
    if (!room || !localMedia) return;
    localMedia.innerHTML = '';
    room.localParticipant.tracks.forEach(pub => {
      const track = pub.track;
      if (!track) return;
      const el = track.attach();
      el.dataset.name = track.name;
      localMedia.appendChild(el);
    });
  }

  function attachParticipant(p) {
    const holder = remoteMedia;
    if (!holder) return;

    // Attach already published tracks
    p.tracks.forEach(pub => {
      if (!pub.track) return;
      const el = pub.track.attach();
      el.dataset.name = pub.track.name;
      holder.appendChild(el);
    });

    // Subscribe to new tracks
    const onSub = (track) => {
      const el = track.attach();
      el.dataset.name = track.name;
      holder.appendChild(el);
    };
    const onUnsub = (track) => {
      try { track.detach().forEach(el => el.remove()); } catch {}
    };
    p.on('trackSubscribed', onSub);
    p.on('trackUnsubscribed', onUnsub);

    // Cleanup
    p.on('disconnected', () => {
      try { p.tracks.forEach(pub => pub.track?.detach()?.forEach(el => el.remove())); } catch {}
    });
  }

  async function startVideoSession(auto = false) {
    try {
      if (!conversation) {
        if (!auto) toast('Open the chat first');
        return;
      }
      if (videoRoom) return; // already running

      const Video = window.Twilio && window.Twilio.Video;
      if (!Video) {
        alert('Twilio Video SDK is not loaded (check the CDN script).');
        return;
      }

      // Ensure/create a room for this conversation on your backend
      const ensureRes = await fetch(`${API_BASE}/api/video/ensure-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationSid: conversation.sid, identity: guestIdentity }),
      });
      if (!ensureRes.ok) throw new Error(`ensure-room failed: ${ensureRes.status}`);
      const { roomName } = await ensureRes.json();

      // Get a fresh guest token
      const tokRes = await fetch(
        `${API_BASE}/api/video/token/guest?identity=${encodeURIComponent(guestIdentity)}&roomName=${encodeURIComponent(roomName)}`
      );
      if (!tokRes.ok) throw new Error(`video token failed: ${tokRes.status}`);
      const { token } = await tokRes.json();

      // Optional: pre-create local tracks so the browser prompts immediately
      const previewTracks = await Video.createLocalTracks({ audio: true, video: { width: 640 } });
      // Attach preview immediately
      try {
        localMedia.innerHTML = '';
        previewTracks.forEach(t => localMedia.appendChild(t.attach()));
      } catch {}

      // Connect using the same tracks (no double capture)
      videoRoom = await Video.connect(token, {
        name: roomName,
        tracks: previewTracks,
      });

      // Attach remote participants
      remoteMedia && (remoteMedia.innerHTML = '');
      Array.from(videoRoom.participants.values()).forEach(attachParticipant);
      videoRoom.on('participantConnected', attachParticipant);

      // Disconnect cleanup
      videoRoom.on('disconnected', () => {
        try {
          videoRoom.localParticipant.tracks.forEach(pub => pub.track?.detach()?.forEach(el => el.remove()));
          remoteMedia && (remoteMedia.innerHTML = '');
        } catch {}
        videoRoom = null;
        hide(endVideoBtn);
        show(startVideoBtn);
        hide(videoShell);
        try { localStorage.removeItem(LS.VIDEO_ACTIVE); } catch {}
      });

      // UI
      show(videoShell);
      hide(startVideoBtn);
      show(endVideoBtn);
      try { localStorage.setItem(LS.VIDEO_ACTIVE, '1'); } catch {}

      // Notify in chat (non-blocking)
      try { await conversation.sendMessage('[system] Video call started'); } catch {}
    } catch (e) {
      console.error('[webchat] startVideoSession failed:', e);
      if (!auto) alert('Could not start the video call. Check console and server vars.');
      try { localStorage.removeItem(LS.VIDEO_ACTIVE); } catch {}
    }
  }

  async function endVideoSession() {
    try { if (videoRoom) videoRoom.disconnect(); } catch {}
    hide(endVideoBtn);
    show(startVideoBtn);
    hide(videoShell);
    try { localStorage.removeItem(LS.VIDEO_ACTIVE); } catch {}
    try { await conversation?.sendMessage('[system] Video call ended'); } catch {}
  }

  // Ensure we disconnect video if the user navigates away
  window.addEventListener('beforeunload', () => {
    try { videoRoom && videoRoom.disconnect(); } catch {}
  });

  // ---------- Core boot / resume ----------
  async function initClientAndOpenConversation(conversationSid) {
    // 1) Fetch/refresh token (reusing identity if we have it)
    const token = await fetchGuestToken();

    // 2) Init Conversations client
    if (!window.Twilio?.Conversations?.Client) {
      alert('Twilio Conversations SDK failed to load.');
      return null;
    }
    client = new window.Twilio.Conversations.Client(token);

    // Refresh token hooks
    client.on('tokenAboutToExpire', async () => {
      try { await client.updateToken(await fetchGuestToken()); } catch (e2) { console.error('Guest token refresh failed', e2); }
    });
    client.on('tokenExpired', async () => {
      try { await client.updateToken(await fetchGuestToken()); } catch (e2) { console.error('Guest token refresh (expired) failed', e2); }
    });

    if (client.state !== 'initialized') {
      await new Promise((resolve) =>
        client.on('stateChanged', (state) => state === 'initialized' && resolve())
      );
    }

    // 3) Get conversation by SID
    let convo = null;
    const maxTries = 6, delayMs = 800;
    for (let i = 0; i < maxTries; i++) {
      try {
        convo = await client.getConversationBySid(conversationSid);
        break;
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    if (!convo) return null;

    conversation = convo;
    saveSession();

    // 4) Load recent messages
    try {
      const page = await conversation.getMessages();
      messagesEl.innerHTML = '';
      page.items.forEach((m) => appendMessage(m.author || 'system', m.body || ''));
    } catch (e) {
      console.warn('Failed to load message history', e);
    }

    // 5) Bind events & show UI
    if (!window.__twilioBound) {
      startVideoBtn?.addEventListener('click', () => startVideoSession(false));
      endVideoBtn?.addEventListener('click', endVideoSession);
      endChatBtn?.addEventListener('click', endChat);
      window.__twilioBound = true;
    }

    conversation.on('messageAdded', (msg) => {
      appendMessage(msg.author || 'system', msg.body || '');
    });

    hide(startForm);
    show(chatContainer);

    // 6) Enable/disable video button based on backend feature flag
    try {
      const r = await fetch(`${API_BASE}/api/video/enabled`);
      const data = await r.json().catch(() => ({}));
      if (data?.enabled) show(startVideoBtn);
      else hide(startVideoBtn);
    } catch {
      hide(startVideoBtn);
    }

    return conversation;
  }

  async function resumeFromStorage() {
    try {
      guestIdentity = localStorage.getItem(LS.IDENTITY) || null;
      const storedSid = localStorage.getItem(LS.CONVO);
      const wasVideoActive = !!localStorage.getItem(LS.VIDEO_ACTIVE);

      if (storedSid) {
        const convo = await initClientAndOpenConversation(storedSid);
        if (convo && wasVideoActive) {
          // Try to rejoin video after a small delay (so UI is visible)
          setTimeout(() => startVideoSession(true), 400);
        }
        return;
      }
      // No stored convo: show the form prefilled if we know name/email
      const nameEl = document.getElementById('name');
      const emailEl = document.getElementById('email');
      try {
        const n = localStorage.getItem(LS.NAME); if (n) nameEl.value = n;
        const e = localStorage.getItem(LS.EMAIL); if (e) emailEl.value = e;
      } catch {}
    } catch (e) {
      console.warn('Resume failed; falling back to fresh start', e);
    }
  }

  // ---------- New chat flow ----------
  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();

    try {
      // Persist for UX
      try { localStorage.setItem(LS.NAME, name); localStorage.setItem(LS.EMAIL, email); } catch {}

      // 1) Create or fetch conversation (uniqueName = email)
      const convoRes = await fetch(`${API_BASE}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueName: email,
          friendlyName: name || email,
          attributes: { name, email },
        }),
      });
      if (!convoRes.ok) {
        const txt = await convoRes.text().catch(() => '');
        alert(`Failed to create conversation: ${txt}`);
        return;
      }
      const convoData = await convoRes.json();

      // 2) Guest token (this also sets guestIdentity)
      const token = await fetchGuestToken();

      // 3) Ensure participant membership
      try {
        const addRes = await fetch(
          `${API_BASE}/api/conversations/${convoData.sid}/participants`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              identity: guestIdentity,
              attributes: { name, email, role: 'guest' },
            }),
          }
        );
        if (!addRes.ok && addRes.status !== 409) {
          const errData = await addRes.json().catch(() => ({}));
          if (errData.error?.code !== 50433) {
            throw Object.assign(
              new Error(errData.error?.message || 'Failed to add participant'),
              { status: addRes.status, code: errData.error?.code }
            );
          }
        }
      } catch (err) {
        if (err.status !== 409 && err.code !== 50433) {
          alert('Failed to join conversation as participant.');
          return;
        }
      }

      // 4) Initialize client and open conversation
      const convo = await initClientAndOpenConversation(convoData.sid);
      if (!convo) {
        alert('Could not open the conversation yet. Please retry.');
        return;
      }

      // 5) Seed welcome message (non-blocking)
      fetch(`${API_BASE}/api/conversations/${convoData.sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'system', body: 'Thanks! An agent will join shortly.' }),
      }).catch(() => {});

    } catch (eAll) {
      console.error(eAll);
      alert('Unexpected error starting chat.');
    }
  });

  // ---------- Send message ----------
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = messageInput.value.trim();
    if (!body || !conversation) return;
    try {
      await conversation.sendMessage(body);
      appendMessage(guestIdentity || 'me', body);
      messageInput.value = '';
    } catch (err) {
      console.error('sendMessage failed', err);
    }
  });

  // ---------- End chat ----------
  async function endChat() {
    try {
      // Try to leave the conversation gracefully
      await conversation?.leave?.();
    } catch (e) {
      console.warn('leave() failed or unsupported', e);
    }
    try {
      // Optional backend close (idempotent; ignore failures)
      if (conversation?.sid) {
        fetch(`${API_BASE}/api/conversations/${conversation.sid}/close`, { method: 'POST' })
          .catch(() => {});
      }
    } catch {}
    await endVideoSession();
    clearSession();
    // Reset UI
    try { messagesEl.innerHTML = ''; } catch {}
    show(startForm);
    hide(chatContainer);
    toast('Chat ended');
  }

  // ---------- Boot ----------
  resumeFromStorage();
})();
