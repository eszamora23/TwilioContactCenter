// contact-center/client/src/softphone/VoiceDevice.js
import { Device } from '@twilio/voice-sdk';
import Api from '../../index.js';
import { setCallSid } from './callSidStore.js';

export class VoiceDevice {
  constructor() {
    this.device = undefined;
    this.current = undefined;
    this._refreshTimer = undefined;
    this.onIncoming = null;
    this.onStatusChange = null;
    this.onMuteSync = null; // Callback for mute sync
  }

  _status(s) {
    try {
      this.onStatusChange && this.onStatusChange(s);
    } catch {}
  }

  async register() {
    const token = await Api.voiceToken();
    this.device = new Device(token, {
      audio: { echoCancellation: true }
    });

    this.device.on('registered', () => {
      console.log('Voice registered');
      this._status('Idle');
    });
    this.device.on('unregistered', () => {
      console.log('Voice unregistered');
      this._status('Idle');
    });
    this.device.on('error', (e) => {
      console.error('Voice error', e);
      if (String(e.message || '').toLowerCase().includes('token')) {
        this.refreshToken().catch(console.error);
      }
    });

    this.device.on('incoming', (call) => {
      this.current = call;
      this._wireCall(call);
      this._status('Incoming');
      this.onIncoming?.(call);
    });

    this.device.on('tokenWillExpire', async () => {
      await this.refreshToken();
    });

    await this.device.register();

    this._refreshTimer = setInterval(
      () => this.refreshToken().catch(() => {}),
      55 * 60 * 1000
    );
  }

  async refreshToken() {
    const newToken = await Api.voiceToken();
    if (this.device?.updateToken) {
      await this.device.updateToken(newToken);
      return;
    }
    await this.device?.unregister();
    this.device = new Device(newToken, {
      audio: { echoCancellation: true }
    });
    await this.device.register();
  }

  _wireCall(call) {
    const fetchSid = () => {
      try {
        // SDK v2: a veces parameters es Map
        return call?.parameters?.CallSid || call?.parameters?.get?.('CallSid') || null;
      } catch { return null; }
    };

    call.on('accept', () => {
      const sid = fetchSid();
      if (sid) setCallSid(sid);
      console.log('Call accepted', sid || '');
      this._status('In Call');

      // Sync mute state
      const currentMute = call.isMuted();
      if (this.onMuteSync) {
        this.onMuteSync(currentMute);
      }
    });

    call.on('disconnect', () => {
      console.log('Call ended');
      setCallSid(null);
      if (this.current === call) this.current = undefined;
      this._status('Idle');
    });

    call.on('error', (e) => {
      console.error('Call error', e);
      setCallSid(null);
      this._status('Idle');
    });
  }

  async dial(to) {
    if (!this.device) throw new Error('Device not ready');
    const call = await this.device.connect({ params: { To: to } });
    this.current = call;
    this._wireCall(call);
    // en outgoing, el CallSid llega un poco después; lo enganchamos en 'accept'
    this._status('In Call');
    return call;
  }

  async disconnect() {
    clearInterval(this._refreshTimer);
    try {
      await this.current?.disconnect();
    } catch {}
    if (this.device) {
      try {
        await this.device.unregister();
      } catch {}
      this.device.destroy();
      this.device = undefined;
    }
    this._status('Idle');
  }
}