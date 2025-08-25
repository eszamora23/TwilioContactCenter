import { fetchGuestToken } from './token.service.js';
import { loadScriptOnce } from './script.loader.js';

async function waitForConversationsSDK(maxWaitMs = 7000) {
  if (!(window.Twilio?.Conversations?.Client)) {
    await loadScriptOnce(
      'https://media.twiliocdn.com/sdk/js/conversations/releases/2.4.1/twilio-conversations.min.js',
      { crossorigin: true }
    );
  }
  const start = Date.now();
  while (!(window.Twilio?.Conversations?.Client)) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error('Twilio Conversations SDK failed to load.');
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return window.Twilio.Conversations.Client;
}

export class ConversationsService {
  client = null;

  async init() {
    // Asegura SDK presente antes de crear el cliente
    const TwClient = await waitForConversationsSDK();

    const token = await fetchGuestToken();
    this.client = new TwClient(token);

    // Token refresh
    this.client.on('tokenAboutToExpire', async () => {
      try { await this.client.updateToken(await fetchGuestToken()); }
      catch (e) { console.error('Guest token refresh failed', e); }
    });
    this.client.on('tokenExpired', async () => {
      try { await this.client.updateToken(await fetchGuestToken()); }
      catch (e) { console.error('Guest token refresh (expired) failed', e); }
    });

    if (this.client.state !== 'initialized') {
      await new Promise((resolve) =>
        this.client.on('stateChanged', (state) => state === 'initialized' && resolve())
      );
    }
    return this.client;
  }

  async getConversationBySidWithRetry(sid, maxTries = 6, delayMs = 800) {
    let convo = null;
    for (let i = 0; i < maxTries; i++) {
      try {
        convo = await this.client.getConversationBySid(sid);
        break;
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        if (msg.includes('not initialized') && i < maxTries - 1) {
          try { await this.init(); } catch {}
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    return convo;
  }
}
