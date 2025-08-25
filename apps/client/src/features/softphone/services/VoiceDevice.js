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
    this.onMuteSync = null; // Callback to mirror mute state into React state
    this._deviceOptions = null; // keep the exact options used to (re)create Device
  }

  _status(s) {
    try {
      this.onStatusChange && this.onStatusChange(s);
    } catch {}
  }

  /**
   * Build robust Device options:
   * - edge: prefer explicit edges (comma-separated) for consistent routing
   * - codecPreferences: prefer opus
   * - maxCallSignalingTimeoutMs: keep WS long enough to recover mid-call
   * - logLevel: 'error' to reduce noise in production
   */
  _buildDeviceOptions() {
    const raw = (import.meta?.env?.VITE_TWILIO_EDGE || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const edge =
      raw.length === 0 ? undefined :
      raw.length === 1 ? raw[0] : raw; // string or string[] (fallback order)

    return {
      audio: { echoCancellation: true },
      logLevel: 'error',
      ...(edge ? { edge } : {}),
      codecPreferences: ['opus', 'pcmu'],
      maxCallSignalingTimeoutMs: 30000,
    };
  }

  async register() {
    const token = await Api.voiceToken();
    this._deviceOptions = this._buildDeviceOptions();

    this.device = new Device(token, this._deviceOptions);

    // -- Device lifecycle
    this.device.on('registered', () => {
      console.log('[Voice] registered');
      this._status('Idle');
    });
    this.device.on('unregistered', () => {
      console.log('[Voice] unregistered');
      this._status('Idle');
    });

    // Handle token errors gracefully (e.g., 401)
    this.device.on('error', (e) => {
      console.error('[Voice] device error', e);
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('token')) {
        this.refreshToken().catch(console.error);
      }
    });

    // Incoming call
    this.device.on('incoming', (call) => {
      this.current = call;
      this._wireCall(call);
      this._status('Incoming');
      this.onIncoming?.(call);
    });

    // Token lifecycle events
    this.device.on('tokenWillExpire', async () => {
      await this.refreshToken();
    });
    // Some versions also emit tokenExpired
    this.device.on?.('tokenExpired', async () => {
      await this.refreshToken();
    });

    await this.device.register();

    // Proactive refresh (belt & suspenders)
    this._refreshTimer = setInterval(
      () => this.refreshToken().catch(() => {}),
      55 * 60 * 1000
    );
  }

  async refreshToken() {
    const newToken = await Api.voiceToken();
    // Fast path: Device.updateToken exists
    if (this.device?.updateToken) {
      await this.device.updateToken(newToken);
      return;
    }
    // Conservative fallback: rebuild Device with the same options
    try { await this.device?.unregister(); } catch {}
    try { this.device?.destroy?.(); } catch {}
    this.device = new Device(newToken, this._deviceOptions || this._buildDeviceOptions());

    // Re-bind handlers after rebuild
    this.device.on('registered', () => this._status('Idle'));
    this.device.on('unregistered', () => this._status('Idle'));
    this.device.on('error', (e) => {
      console.error('[Voice] device error (rebuilt)', e);
    });
    this.device.on('incoming', (call) => {
      this.current = call;
      this._wireCall(call);
      this._status('Incoming');
      this.onIncoming?.(call);
    });
    this.device.on?.('tokenWillExpire', async () => { await this.refreshToken(); });
    this.device.on?.('tokenExpired', async () => { await this.refreshToken(); });

    await this.device.register();
  }

  _wireCall(call) {
    const fetchSid = () => {
      try {
        // Voice SDK v2: parameters may be a Map
        return call?.parameters?.CallSid || call?.parameters?.get?.('CallSid') || null;
      } catch { return null; }
    };

    call.on('accept', () => {
      const sid = fetchSid();
      if (sid) setCallSid(sid);
      console.log('[Voice] call accepted', sid || '');
      this._status('In Call');

      // Sync initial mute state
      const currentMute = call.isMuted?.() ?? false;
      try { this.onMuteSync?.(currentMute); } catch {}
    });

    call.on('mute', (isMuted) => {
      // Fired when local audio mute state changes
      try { this.onMuteSync?.(!!isMuted); } catch {}
    });

    call.on('disconnect', () => {
      console.log('[Voice] call ended');
      setCallSid(null);
      try { window.localStorage.removeItem('callSid'); } catch {}
      if (this.current === call) this.current = undefined;
      this._status('Idle');
    });

    call.on('cancel', () => {
      console.log('[Voice] call cancelled');
      setCallSid(null);
      try { window.localStorage.removeItem('callSid'); } catch {}
      if (this.current === call) this.current = undefined;
      this._status('Idle');
      this.onIncoming?.(null);
    });

    call.on('error', (e) => {
      console.error('[Voice] call error', e);
      setCallSid(null);
      try { window.localStorage.removeItem('callSid'); } catch {}
      this._status('Idle');
    });
  }

  async dial(to) {
    if (!this.device) throw new Error('Device not ready');

    // Device.connect → your TwiML App → /api/voice/outbound reads "To"
    const call = await this.device.connect({ params: { To: String(to).trim() } });

    this.current = call;
    this._wireCall(call);

    // Outgoing: CallSid arrives shortly after; we set status now for UX
    this._status('In Call');

    return call;
  }

  async mute(enable = true) {
    try {
      await this.current?.mute?.(!!enable);
      try { this.onMuteSync?.(!!enable); } catch {}
    } catch (e) {
      console.error('[Voice] mute toggle error', e);
      throw e;
    }
  }

  sendDigits(digits) {
    try { this.current?.sendDigits?.(String(digits)); } catch (e) { console.error('[Voice] sendDigits error', e); }
  }

  async disconnect() {
    clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;
    try {
      await this.current?.disconnect();
    } catch {}

    if (this.device) {
      try { await this.device.unregister(); } catch {}
      try { this.device.destroy?.(); } catch {}
      this.device = undefined;
    }
    this._status('Idle');
  }
}
