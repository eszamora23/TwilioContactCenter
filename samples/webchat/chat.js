async function startChat(event) {
  event.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;

  // Fetch an SDK token
  const tokenResp = await fetch('/api/chat/token');
  const { token, identity } = await tokenResp.json();

  // Create a new Conversation with attributes
  const uniqueName = `web-${crypto.randomUUID()}`;
  const convoResp = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uniqueName,
      friendlyName: name,
      attributes: { name, email }
    })
  });
  const conversation = await convoResp.json();

  // Add this browser as a chat participant
  await fetch(`/api/conversations/${conversation.sid}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'chat',
      identity,
      attributes: { name, email }
    })
  });

  // Initialize the Conversations SDK and join
  const client = await Twilio.ConversationsClient.create(token);
  const convo = await client.getConversationBySid(conversation.sid);
  try {
    await convo.join();
  } catch (err) {
    // ignore if already joined
  }
  document.getElementById('chat-form').style.display = 'none';
  document.getElementById('chat').style.display = 'block';
  console.log('Joined conversation', convo.sid);
}

document.getElementById('chat-form').addEventListener('submit', startChat);
