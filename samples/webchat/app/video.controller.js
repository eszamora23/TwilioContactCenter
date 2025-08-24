import { VideoService } from '../services/video.service.js';
import { SessionStore } from '../services/session.store.js';
import { bus } from '../services/bus.js';

export class VideoController {
  svc = new VideoService();

  async start(convoSid, previewCb, { auto = false } = {}) {
    const room = await this.svc.start(convoSid, previewCb);
    SessionStore.videoActive = true;

    // Emitir evento UI
    bus.emit('video:started', room);

    // Participantes remotos (emitimos al bus para que video.view los adjunte)
    room.on('participantConnected', p => bus.emit('video:participant:connected', p));

    // Cleanup
    room.on('disconnected', () => {
      SessionStore.videoActive = false;
      bus.emit('video:ended');
    });

    return room;
  }

  end() {
    try { this.svc.end(); } catch {}
    SessionStore.videoActive = false;
    bus.emit('video:ended');
  }
}
