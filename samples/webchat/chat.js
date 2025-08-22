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

    // Fetch token for Conversations SDK
    const tokenRes = await fetch(`${API_BASE}/api/chat/token`);
    if (!tokenRes.ok) {
      alert('Failed to fetch token');
      return;
    }
    const { token, identity } = await tokenRes.json();

    // Add this user as chat participant
    const participantRes = await fetch(`${API_BASE}/api/conversations/${convoData.sid}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat',
        identity,
        attributes: { name, email }
      })
    });
    if (!participantRes.ok) {
      alert('Failed to add participant to conversation');
      return;
    }

    // Initialize Conversations client and join
    if (!window.Twilio?.Conversations?.Client) {
      alert('Twilio Conversations SDK failed to load.');
      return;
    }
    const client = await Twilio.Conversations.Client.create(token);
    conversation = await client.getConversationBySid(convoData.sid);
    await conversation.join();

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
