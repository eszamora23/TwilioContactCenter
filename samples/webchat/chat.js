// samples/webchat/chat.js
const API_BASE = window.API_BASE || 'http://localhost:4000';

(async function () {
  const startForm = document.getElementById('start-form');
  const chatContainer = document.getElementById('chat-container');
  const messagesEl = document.getElementById('messages');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');

  let conversation;
  let client;
  let guestIdentity = null;

  async function fetchGuestToken() {
    const url = guestIdentity
      ? `${API_BASE}/api/chat/refresh/guest?identity=${encodeURIComponent(guestIdentity)}`
      : `${API_BASE}/api/chat/token/guest`;

    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Token error: ${res.status} ${txt}`);
    }
    const data = await res.json();
    if (data.identity) guestIdentity = data.identity;
    return data.token;
  }

  function appendMessage(author, body) {
    const li = document.createElement('li');
    li.textContent = `${author}: ${body}`;
    messagesEl.appendChild(li);
  }

  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();

    try {
      // 1) Create/fetch conversation (uniqueName = email)
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

      // 2) Send initial system message (optional)
      await fetch(`${API_BASE}/api/conversations/${convoData.sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: 'system',
          body: 'Thank you! An agent will join soon.',
        }),
      }).catch(() => { /* non-blocking */ });

      // 3) Get guest token (store identity for refresh)
      const token = await fetchGuestToken();

      // 4) Add this web user as participant (id = guestIdentity)
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

      // 5) Init Conversations client
      if (!window.Twilio?.Conversations?.Client) {
        alert('Twilio Conversations SDK failed to load.');
        return;
      }
      client = new Twilio.Conversations.Client(token);

      // token refresh
      client.on('tokenAboutToExpire', async () => {
        try {
          const newToken = await fetchGuestToken();
          await client.updateToken(newToken);
        } catch (e2) {
          console.error('Guest token refresh failed', e2);
        }
      });
      client.on('tokenExpired', async () => {
        try {
          const newToken = await fetchGuestToken();
          await client.updateToken(newToken);
        } catch (e2) {
          console.error('Guest token refresh (expired) failed', e2);
        }
      });

      if (client.state !== 'initialized') {
        await new Promise((resolve) =>
          client.on('stateChanged', (state) => state === 'initialized' && resolve())
        );
      }

      // 6) Get conversation with small retry (propagation)
      const maxTries = 6;
      const delayMs = 800;
      let tries = 0;
      while (tries < maxTries) {
        try {
          conversation = await client.getConversationBySid(convoData.sid);
          break;
        } catch (err) {
          const msg = String(err?.message || '').toLowerCase();
          if (msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
            await new Promise((r) => setTimeout(r, delayMs));
            tries++;
            continue;
          }
          throw err;
        }
      }
      if (!conversation) {
        alert('Could not open conversation yet. Please retry.');
        return;
      }

      // 7) Load history
      const page = await conversation.getMessages();
      page.items.forEach((m) => appendMessage(m.author || 'system', m.body || ''));

      // 8) Show UI and subscribe to new messages
      startForm.style.display = 'none';
      chatContainer.style.display = 'block';

      conversation.on('messageAdded', (msg) => {
        appendMessage(msg.author || 'system', msg.body || '');
      });
    } catch (eAll) {
      console.error(eAll);
      alert('Unexpected error starting chat.');
    }
  });

  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = messageInput.value;
    if (!body || !conversation) return;
    try {
      await conversation.sendMessage(body);
      messageInput.value = '';
    } catch (err) {
      console.error('sendMessage failed', err);
    }
  });
})();
