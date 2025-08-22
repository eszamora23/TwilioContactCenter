const API_BASE = window.API_BASE || 'http://localhost:4000';

(async function () {
  const startForm = document.getElementById('start-form');
  const chatContainer = document.getElementById('chat-container');
  const messagesEl = document.getElementById('messages');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');

  let conversation;

  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;

    // Create conversation with attributes
    const convoRes = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uniqueName: email,
        attributes: { name, email }
      })
    });
    if (!convoRes.ok) {
      alert('Failed to create conversation');
      return;
    }
    const convoData = await convoRes.json();

    // Send initial system message
    await fetch(`${API_BASE}/api/conversations/${convoData.sid}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: 'system',
        body: 'Thank you! An agent will join soon.'
      })
    });

    // Fetch token for Conversations SDK
    const tokenRes = await fetch(`${API_BASE}/api/chat/token`);
    if (!tokenRes.ok) {
      alert('Failed to fetch token');
      return;
    }
    const { token, identity } = await tokenRes.json();

    // Add this user as a participant via REST
    try {
      const addRes = await fetch(
        `${API_BASE}/api/conversations/${convoData.sid}/participants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            identity,
            attributes: { name, email },
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
        alert('Failed to join conversation');
        return;
      }
    }

    // Initialize Conversations client
    if (!window.Twilio?.Conversations?.Client) {
      alert('Twilio Conversations SDK failed to load.');
      return;
    }
    const client = new Twilio.Conversations.Client(token);
    if (client.state !== 'initialized') {
      await new Promise((resolve) =>
        client.on('stateChanged', (state) => state === 'initialized' && resolve())
      );
    }
    conversation = await client.getConversationBySid(convoData.sid);

    startForm.style.display = 'none';
    chatContainer.style.display = 'block';

    conversation.on('messageAdded', (msg) => {
      const li = document.createElement('li');
      li.textContent = `${msg.author}: ${msg.body}`;
      messagesEl.appendChild(li);
    });
  });

  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = messageInput.value;
    if (!body || !conversation) return;
    await conversation.sendMessage(body);
    messageInput.value = '';
  });
})();
