// contact-center/client/src/softphone/VoiceDevice.js
import { Device } from '@twilio/voice-sdk';
import Api from '../../index.js';
import { setCallSid } from './callSidStore.js';

/**
 * Enterprise-grade Twilio Voice Device wrapper
 * - Keeps the Device registered between calls (no “dead air” between tasks).
 * - Separates "end call" from "full shutdown" so normal hangups don't tear down signaling.
 * - Auto re-registers on transient drops (WebSocket/transport) with bounded backoff.
 * - Token refresh with rebuild fallback.
 */
export class VoiceDevice {
  constructor() {
    this.device = undefined;          // Twilio Device instance
    this.current = undefined;         // Current Call instance (if any)
    this._refreshTimer = undefined;   // Proactive token refresh interval
    this._deviceOptions = null;       // Options used to instantiate the Device

    // Callbacks (wired by hooks)
    this.onIncoming = null;
    this.onStatusChange = null;
    this.onMuteSync = null;

    // Resilience flags
    this._shuttingDown = false;
    this._reRegTimer = null;
    this._reRegBackoffMs = 500;       // start small
    this._reRegBackoffMaxMs = 5000;   // cap backoff to 5s
  }

  /* --------------------------- internal helpers --------------------------- */

  _status(s) {
    try { this.onStatusChange?.(s); } catch {}
  }

  _buildDeviceOptions() {
    const raw = (import.meta?.env?.VITE_TWILIO_EDGE || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const edge =
      raw.length === 0 ? undefined :
      raw.length === 1 ? raw[0] : raw;

    return {
      audio: { echoCancellation: true },
      logLevel: 'error',
      ...(edge ? { edge } : {}),
      codecPreferences: ['opus', 'pcmu'],
      maxCallSignalingTimeoutMs: 30000,
    };
  }

  _clearReRegTimer() {
    if (this._reRegTimer) {
      clearTimeout(this._reRegTimer);
      this._reRegTimer = null;
    }
  }

  _scheduleReRegister(reason = 'unknown') {
    if (this._shuttingDown) return;
    if (!this.device) return;

    // Debounce / backoff to avoid register storms in flaky networks
    if (this._reRegTimer) return;
    const delay = this._reRegBackoffMs;
    this._reRegBackoffMs = Math.min(this._reRegBackoffMs * 2, this._reRegBackoffMaxMs);

    this._reRegTimer = setTimeout(async () => {
      this._reRegTimer = null;
      if (this._shuttingDown || !this.device) return;
      try {
        await this.device.register();
      } catch (e) {
        // Keep backing off; schedule another attempt.
        this._scheduleReRegister('register-failed');
      }
    }, delay);
  }

  _resetReRegisterBackoff() {
    this._reRegBackoffMs = 500;
    this._clearReRegTimer();
  }

  _wireDevice(device) {
    device.on('registered', () => {
      console.log('[Voice] registered');
      this._resetReRegisterBackoff();
      this._status('Idle');
    });

    device.on('unregistered', () => {
      console.log('[Voice] unregistered');
      this._status('Idle');
      if (!this._shuttingDown) this._scheduleReRegister('unregistered');
    });

    device.on('error', (e) => {
      console.error('[Voice] device error', e);
      const msg = String(e?.message || '').toLowerCase();

      // Token/auth issues → refresh token
      if (msg.includes('token')) {
        this.refreshToken().catch(console.error);
        return;
      }

      // Transport/WS disconnects → gentle re-register with backoff
      if (!this._shuttingDown && (
          msg.includes('transport') ||
          msg.includes('websocket') ||
          msg.includes('disconnect') ||
          msg.includes('31205') // generic Twilio transport error code often seen
        )) {
        this._scheduleReRegister('transport');
      }
    });

    device.on('incoming', (call) => {
      this.current = call;
      this._wireCall(call);
      this._status('Incoming');
      try { this.onIncoming?.(call); } catch {}
    });

    // Token lifecycle
    device.on?.('tokenWillExpire', async () => { await this.refreshToken(); });
    device.on?.('tokenExpired', async () => { await this.refreshToken(); });
  }

  _wireCall(call) {
    const fetchSid = () => {
      try { return call?.parameters?.CallSid || call?.parameters?.get?.('CallSid') || null; }
      catch { return null; }
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
      try { this.onMuteSync?.(!!isMuted); } catch {}
    });

    const onToIdle = () => {
      setCallSid(null);
      try { window.localStorage.removeItem('callSid'); } catch {}
      if (this.current === call) this.current = undefined;
      this._status('Idle');

      // Ensure we remain (or become) registered post-call
      if (!this._shuttingDown) this._scheduleReRegister('post-call');
    };

    call.on('disconnect', () => {
      console.log('[Voice] call ended');
      onToIdle();
    });

    call.on('cancel', () => {
      console.log('[Voice] call cancelled');
      try { this.onIncoming?.(null); } catch {}
      onToIdle();
    });

    call.on('error', (e) => {
      console.error('[Voice] call error', e);
      onToIdle();
    });
  }

  /* ------------------------------- public API ------------------------------ */

  /**
   * Create + register the Device (idempotent). Keeps a proactive token refresh.
   */
  async register() {
    this._shuttingDown = false;

    const token = await Api.voiceToken();
    this._deviceOptions = this._buildDeviceOptions();

    this.device = new Device(token, this._deviceOptions);
    this._wireDevice(this.device);

    await this.device.register();

    // Proactive refresh (belt & suspenders)
    this._refreshTimer = setInterval(
      () => this.refreshToken().catch(() => {}),
      55 * 60 * 1000
    );
  }

  /**
   * Refresh token; rebuild Device if updateToken is not supported.
   */
  async refreshToken() {
    const newToken = await Api.voiceToken();

    // Fast path
    if (this.device?.updateToken) {
      try {
        await this.device.updateToken(newToken);
        return;
      } catch (e) {
        console.warn('[Voice] updateToken failed; rebuilding device', e?.message || e);
      }
    }

    // Rebuild Device (conservative fallback)
    try { await this.device?.unregister?.(); } catch {}
    try { this.device?.destroy?.(); } catch {}

    this.device = new Device(newToken, this._deviceOptions || this._buildDeviceOptions());
    this._wireDevice(this.device);
    await this.device.register();
  }

  /**
   * Place an outbound call via TwiML App; keeps Device registered.
   */
  async dial(to) {
    if (!this.device) throw new Error('Device not ready');
    const call = await this.device.connect({ params: { To: String(to).trim() } });
    this.current = call;
    this._wireCall(call);
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

  /**
   * End the current call but KEEP the Device registered and ready for the next reservation.
   * (Use shutdown() to fully tear down the Device).
   */
  async endCall() {
    try { await this.current?.disconnect?.(); } catch {}
    this.current = undefined;
    this._status('Idle');
    if (!this._shuttingDown) this._scheduleReRegister('endCall');
  }

  /**
   * Backward-compat "disconnect": now behaves as endCall() to avoid tearing down Device
   * on normal hangups. Use shutdown() for full teardown.
   */
  async disconnect() {
    await this.endCall();
  }

  /**
   * Full teardown of the softphone (unregister + destroy). Use ONLY on app exit/unmount.
   */
  async shutdown() {
    this._shuttingDown = true;
    this._clearReRegTimer();
    clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;

    try { await this.current?.disconnect?.(); } catch {}
    this.current = undefined;

    try { await this.device?.unregister?.(); } catch {}
    try { this.device?.destroy?.(); } catch {}

    this.device = undefined;
    this._status('Idle');
  }
}
