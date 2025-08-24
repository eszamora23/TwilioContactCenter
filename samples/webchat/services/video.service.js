import { API_BASE } from './config.js';
import { SessionStore } from './session.store.js';

async function waitForVideoSDK(maxWaitMs = 7000) {
  const start = Date.now();
  while (!(window.Twilio?.Video)) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error('Twilio Video SDK is not loaded.');
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return window.Twilio.Video;
}

export class VideoService {
  room = null;

  async start(conversationSid, previewTracksCb) {
    const Video = await waitForVideoSDK();

    // Ensure room in backend
    const ensureRes = await fetch(`${API_BASE}/api/video/ensure-room`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ conversationSid, identity: SessionStore.identity })
    });
    if (!ensureRes.ok) throw new Error(`ensure-room failed: ${ensureRes.status}`);
    const { roomName } = await ensureRes.json();

    // Video token
    const tokRes = await fetch(
      `${API_BASE}/api/video/token/guest?identity=${encodeURIComponent(SessionStore.identity)}&roomName=${encodeURIComponent(roomName)}`
    );
    if (!tokRes.ok) throw new Error(`video token failed: ${tokRes.status}`);
    const { token } = await tokRes.json();

    // Preview tracks (permiso + preview inmediato)
    const previewTracks = await Video.createLocalTracks({ audio: true, video: { width: 640 } });
    previewTracksCb?.(previewTracks);

    // Conectar usando los mismos tracks
    this.room = await Video.connect(token, { name: roomName, tracks: previewTracks });
    return this.room;
  }

  end() {
    try { this.room?.disconnect(); } catch {}
    this.room = null;
  }
}
