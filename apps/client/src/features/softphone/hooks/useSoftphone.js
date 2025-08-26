import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';
import { VoiceDevice } from '../services/VoiceDevice.js';
import { getCallSid, setCallSid } from '../services/callSidStore.js';
import Api from '../../index.js';
import {
  SOFTPHONE_CHANNEL_KEY,
  SOFTPHONE_POPUP_FEATURES,
} from '../constants.js';

/**
 * Hook encapsulating VoiceDevice lifecycle, BroadcastChannel sync and call controls
 */
export default function useSoftphone(remoteOnly = false) {
  const { t } = useTranslation();
  const isPopupRef = useRef(
    remoteOnly ||
      (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('popup') === 'softphone')
  );
  const isPopup = isPopupRef.current;

  const [dev] = useState(() => (isPopup ? null : new VoiceDevice()));
  const [ready, setReady] = useState(false);
  const [to, setTo] = useState('');
  const [incoming, setIncoming] = useState(null);
  const [isIncomingOpen, setIncomingOpen] = useState(false);
  const [callStatus, setCallStatus] = useState('Idle');
  const [isMuted, setIsMuted] = useLocalStorage('mute_state', false);
  const [callStart, setCallStart] = useState(null);
  const [holding, setHolding] = useState(false);
  const [recStatus, setRecStatus] = useState('inactive');
  const [error, setError] = useState('');
  const [channelError, setChannelError] = useState(false);
  const [useStorageFallback, setUseStorageFallback] = useState(false);

  const tickRef = useRef(null);
  const [, force] = useState(0);

  const chanRef = useRef(null);
  const pendingRef = useRef({});
  const POPUP_NAME = 'softphone_popup';
  const POPUP_URL = `${window.location.origin}?popup=softphone`;
  const [popupOpen, setPopupOpen] = useState(false);
  const popupWinRef = useRef(null);

  useEffect(() => {
    if (!dev) return undefined;
    dev.onMuteSync = setIsMuted;
    return () => {
      dev.onMuteSync = null;
    };
  }, [dev, setIsMuted]);

  const elapsed = useMemo(() => {
    if (!callStart) return '00:00';
    const sec = Math.floor((Date.now() - callStart) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }, [callStart, force]);

  const publishState = useCallback(() => {
    if (isPopup) return;
    try {
      const sid = getCallSid();
      const msg = {
        type: 'state',
        payload: {
          ready,
          callStatus,
          isMuted,
          holding,
          recStatus,
          to,
          elapsed,
          hasIncoming: !!incoming,
          callSid: sid,
        },
      };
      // 1) intenta BroadcastChannel
      chanRef.current?.postMessage?.(msg);
      // 2) espejo por storage (best-effort) sin cambiar transporte
      try {
        localStorage.setItem(
          SOFTPHONE_CHANNEL_KEY,
          JSON.stringify({ ...msg, ts: Date.now() })
        );
      } catch {}
    } catch (e) {
      console.warn('[softphone channel state error]', e);
      setChannelError(true);
      // ❗ No forzar fallback aquí ni tocar chanRef; mantener BC evita desincronizar con el popup.
    }
  }, [ready, callStatus, isMuted, holding, recStatus, to, elapsed, incoming, isPopup]);

  const publishStateRef = useRef(publishState);
  useEffect(() => {
    publishStateRef.current = publishState;
  }, [publishState]);

  useEffect(() => {
    if (isPopup) return;
    const sid = getCallSid();
    if (sid) {
      setCallStatus('In Call');
      setCallStart(Date.now());
      clearInterval(tickRef.current);
      tickRef.current = setInterval(() => force((x) => x + 1), 1000);
      Api.recStatus(sid)
        .then((s) => setRecStatus(s || 'inactive'))
        .catch(() => {
          setCallStatus('Idle');
          setCallStart(null);
          clearInterval(tickRef.current);
        });
      setTimeout(() => publishStateRef.current(), 0);
    }
  }, [isPopup]);

  const sendCmd = useCallback(
    (action, extra = {}, waitForAck = false) => {
      const id = waitForAck ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null;
      return new Promise((resolve, reject) => {
        try {
          const ch = chanRef.current;
          if (id) pendingRef.current[id] = { resolve, reject };
          if (!ch || typeof ch.postMessage !== 'function') {
            throw new Error('channel not ready');
          }
          ch.postMessage({ type: 'cmd', payload: { action, ...extra }, id });
          if (!id) resolve();
        } catch (e) {
          console.warn('[softphone channel cmd error]', e);
          setChannelError(true);
          // ❗ No cambies a storage aquí; mantener ambos extremos en BC.
          if (id) delete pendingRef.current[id];
          reject(e);
        }
      });
    },
    []
  );

  // Device lifecycle
  useEffect(() => {
    if (isPopup) return undefined;
    const boot = async () => {
      dev.onIncoming = (call) => {
        setIncoming(call);
        setIncomingOpen(true);
        setCallStatus('Incoming');

        if (
          typeof window !== 'undefined' &&
          typeof Notification === 'function' &&
          (document.hidden || !document.hasFocus())
        ) {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              const n = new Notification(t('incomingCall'), {
                body: t('acceptIncomingPrompt'),
              });
              n.onclick = () => window.focus();
            }
          });
        }

        setTimeout(() => publishStateRef.current(), 0);
      };
      dev.onStatusChange = (status) => {
        setCallStatus(status);
        if (status === 'In Call') {
          setCallStart(Date.now());
          clearInterval(tickRef.current);
          tickRef.current = setInterval(() => force((x) => x + 1), 1000);
          const sid = getCallSid();
          if (sid) Api.recStatus(sid).then((s) => setRecStatus(s || 'inactive')).catch(() => setRecStatus('inactive'));
        }
        if (status === 'Idle') {
          setCallStart(null);
          setIsMuted(false);
          setHolding(false);
          setRecStatus('inactive');
          clearInterval(tickRef.current);
        }
        setTimeout(() => publishStateRef.current(), 0);
      };

      try {
        await dev.register();
        setReady(true);
      } catch {
        setError(t('registrationError'));
      }
    };

    boot().catch(() => setError(t('generalError')));
    return () => {
      clearInterval(tickRef.current);
      dev.shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPopup]);

  // BroadcastChannel or fallback channel setup
  useEffect(() => {
    let ch;
    let usingStorage = useStorageFallback;

    if (!usingStorage && typeof window !== 'undefined' && typeof BroadcastChannel === 'function') {
      try {
        ch = new BroadcastChannel(SOFTPHONE_CHANNEL_KEY);
      } catch (e) {
        console.warn('[softphone channel init error]', e);
        setChannelError(true);
        usingStorage = true;
        setUseStorageFallback(true);
      }
    } else if (!usingStorage) {
      setChannelError(true);
      usingStorage = true;
      setUseStorageFallback(true);
    }

    if (usingStorage) {
      const storageHandler = (e) => {
        if (e.key === SOFTPHONE_CHANNEL_KEY && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            chanRef.current?.onmessage?.({ data });
          } catch (err) {
            console.error('[softphone storage channel parse error]', err);
          }
        }
      };
      window.addEventListener('storage', storageHandler);
      ch = {
        postMessage: (msg) => {
          try {
            localStorage.setItem(
              SOFTPHONE_CHANNEL_KEY,
              JSON.stringify({ t: Date.now(), ...msg }),
            );
          } catch (err) {
            console.error('[softphone storage channel post error]', err);
            setChannelError(true);
          }
        },
        close: () => window.removeEventListener('storage', storageHandler),
        onmessage: null,
      };
    }

    chanRef.current = ch;

    const postSafe = (data) => {
      try {
        ch?.postMessage?.(data);
      } catch (e) {
        console.warn('[softphone channel post error]', e);
        setChannelError(true);
        // no cambiamos transporte
      }
      // espejo por storage para robustez
      try {
        localStorage.setItem(
          SOFTPHONE_CHANNEL_KEY,
          JSON.stringify({ ...(data || {}), ts: Date.now() })
        );
      } catch {}
    };

    ch.onmessage = async (evt) => {
      const { type, payload, id, ok } = evt.data || {};

      // ===================== POPUP CONTEXT =====================
      if (isPopup) {
        if (type === 'state') {
          setReady(!!payload.ready);
          setCallStatus(payload.callStatus || 'Idle');
          setIsMuted(!!payload.isMuted);
          setHolding(!!payload.holding);
          setRecStatus(payload.recStatus || 'inactive');
          setTo(payload.to || '');
          setIncoming(payload.hasIncoming ? {} : null);
          setIncomingOpen(!!payload.hasIncoming);

          if (payload.callStatus === 'Idle') {
            setCallSid(null);
          } else {
            setCallSid(payload.callSid || null);
          }

          if (payload.elapsed) {
            const [m, s] = String(payload.elapsed).split(':').map((x) => parseInt(x, 10) || 0);
            const sec = m * 60 + s;
            const startTime = payload.callStatus === 'In Call' ? Date.now() - sec * 1000 : null;
            setCallStart(startTime);
            if (payload.callStatus === 'In Call') {
              if (!tickRef.current) {
                tickRef.current = setInterval(() => force((x) => x + 1), 1000);
              }
            } else {
              clearInterval(tickRef.current);
              tickRef.current = null;
            }
          } else {
            setCallStart(null);
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
          return;
        }

        if (type === 'resp' && id && pendingRef.current[id]) {
          const { resolve, reject } = pendingRef.current[id];
          delete pendingRef.current[id];
          if (ok) resolve();
          else reject(new Error('cmd failed'));
          return;
        }

        if (type === 'cmd') {
          const action = payload?.action;
          // Handshake: responder ping con pong
          if (action === 'ping') {
            postSafe({ type: 'cmd', payload: { action: 'pong' } });
            return;
          }
          if (action === 'close') {
            try { window.close(); } catch {}
            return;
          }
          // Otros cmd no se ejecutan en popup
          return;
        }

        return;
      }

      // ===================== MAIN CONTEXT =====================
      if (type === 'popup-closed') {
        setPopupOpen(false);
        popupWinRef.current = null;
        return;
      }

      if (type !== 'cmd') return;

      const action = payload?.action;
      // Handshake: si el popup hace ping, contestar con pong y publicar estado
      if (action === 'ping') {
        postSafe({ type: 'cmd', payload: { action: 'pong' } });
        publishState();
        return;
      }

      if (action === 'ready') {
        // no-op, solo confirmación
        return;
      }

      // Ejecutar operaciones en main
      let success = true;
      try {
        if (action === 'dial') {
          const num = String(payload.to || '').trim();
          if (num) {
            setTo(num);
            await dial(num);
          }
        }
        if (action === 'hangup') await hangup();
        if (action === 'mute') await toggleMute(true);
        if (action === 'unmute') await toggleMute(false);
        if (action === 'dtmf' && payload.digit) sendDtmf(String(payload.digit));
        if (action === 'accept') success = await acceptIncoming();
        if (action === 'reject') success = await rejectIncoming();
        if (action === 'hold') await holdStart(payload);    // acepta overrides
        if (action === 'unhold') await holdStop(payload);   // acepta overrides
        if (action === 'recStart') await recStart();
        if (action === 'recPause') await recPause();
        if (action === 'recResume') await recResume();
        if (action === 'recStop') await recStop();
      } catch (e) {
        console.error('[softphone cmd error]', e);
        success = false;
      } finally {
        publishState();
        if (id) postSafe({ type: 'resp', id, ok: success });
      }
    };

    // Handshake inicial desde el popup o confirmación de disponibilidad
    if (isPopup) {
      postSafe({ type: 'cmd', payload: { action: 'ping' } });
    }

    return () => {
      try { ch.close?.(); } catch (e) { console.warn('[softphone channel close error]', e); }
      chanRef.current = null;               // evitar postMessage tras cleanup
      clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [publishState, isPopup, useStorageFallback]);

  useEffect(() => { if (!isPopup) publishState(); }, [publishState, isPopup]);

  useEffect(() => {
    if (isPopup) return undefined;
    const hangupOnUnload = () => {
      try {
        const sid = getCallSid();
        if (sid) Api.hangup(sid);
      } catch (e) {
        console.warn('[softphone unload hangup error]', e);
      }
    };
    window.addEventListener('beforeunload', hangupOnUnload);
    window.addEventListener('unload', hangupOnUnload);
    return () => {
      window.removeEventListener('beforeunload', hangupOnUnload);
      window.removeEventListener('unload', hangupOnUnload);
    };
  }, [isPopup]);

  useEffect(() => {
    if (!isPopup) return undefined;
    const notifyClose = () => {
      try {
        chanRef.current?.postMessage({ type: 'popup-closed' });
      } catch (e) {
        console.warn('[softphone popup close notify error]', e);
      }
    };
    window.addEventListener('beforeunload', notifyClose);
    window.addEventListener('unload', notifyClose);
    return () => {
      window.removeEventListener('beforeunload', notifyClose);
      window.removeEventListener('unload', notifyClose);
    };
  }, [isPopup]);

  async function dial(num = to) {
    if (isPopup) {
      sendCmd('dial', { to: num });
      return;
    }
    try {
      setError('');
      const call = await dev.dial(String(num).trim());
      if (call) {
        setIncomingOpen(false);
        setCallStatus('In Call');
      }
    } catch {
      setError(t('dialError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function hangup() {
    if (isPopup) {
      sendCmd('hangup');
      setCallStatus('Idle');
      setIsMuted(false);
      setIncoming(null);
      return;
    }
    try {
      setError('');
      const sid = getCallSid();
      if (dev) await dev.endCall();
      if (sid) await Api.hangup(sid);
    } catch {
      setError(t('hangupError'));
    }
    setCallStatus('Idle');
    setIsMuted(false);
    setHolding(false);
    setRecStatus('inactive');
    setIncoming(null);
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function toggleMute(next) {
    if (isPopup) {
      sendCmd(next ? 'mute' : 'unmute');
      setIsMuted(next);
      return;
    }
    try {
      setError('');
      await dev.mute(next);
      setIsMuted(next);
    } catch {
      setError(t('muteError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  /**
   * Try to derive a proper hold context from current Tasks if caller didn't pass overrides.
   * Returns { taskSid, customerCallSid, agentCallSid } or null.
   */
  async function _deriveHoldContext() {
    try {
      const list = await Api.myTasks('assigned,reserved,wrapping');
      // Prefer voice tasks
      const pick = list.find((t) => (t?.attributes?.channel || 'voice') !== 'chat') || list[0];
      if (!pick) return null;

      const a = pick.attributes || {};
      const taskSid = pick.sid;
      const customerCallSid =
        a?.conference?.participants?.customer ||
        a?.customer?.callSid ||
        a?.callSid ||
        a?.call_sid ||
        null;

      const agentCallSid =
        getCallSid() ||
        a?.conference?.participants?.worker ||
        a?.conference?.participants?.agent ||
        null;

      if (!agentCallSid || !customerCallSid) return null;
      return { taskSid, customerCallSid, agentCallSid };
    } catch {
      return null;
    }
  }

  async function holdStart(override) {
    if (isPopup) {
      sendCmd('hold', override || {});
      setHolding(true);
      return;
    }
    try {
      setError('');
      const baseAgentSid = getCallSid();
      const ctx = override && (override.taskSid || override.customerCallSid)
        ? {
            taskSid: override.taskSid || undefined,
            customerCallSid: override.customerCallSid || undefined,
            agentCallSid: override.agentCallSid || baseAgentSid || undefined,
          }
        : await _deriveHoldContext();

      if (!ctx?.agentCallSid || !ctx?.customerCallSid) {
        setError(t('holdError'));
        return;
      }

      await Api.holdStart({
        taskSid: ctx.taskSid,
        agentCallSid: ctx.agentCallSid,
        customerCallSid: ctx.customerCallSid,
        who: (override && override.who) || 'customer',
      });
      setHolding(true);
    } catch {
      setError(t('holdError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function holdStop(override) {
    if (isPopup) {
      sendCmd('unhold', override || {});
      setHolding(false);
      return;
    }
    try {
      setError('');
      const baseAgentSid = getCallSid();
      const ctx = override && (override.taskSid || override.customerCallSid)
        ? {
            taskSid: override.taskSid || undefined,
            customerCallSid: override.customerCallSid || undefined,
            agentCallSid: override.agentCallSid || baseAgentSid || undefined,
          }
        : await _deriveHoldContext();

      if (!ctx?.agentCallSid || !ctx?.customerCallSid) {
        setError(t('unholdError'));
        return;
      }

      await Api.holdStop({
        taskSid: ctx.taskSid,
        agentCallSid: ctx.agentCallSid,
        customerCallSid: ctx.customerCallSid,
        who: (override && override.who) || 'customer',
      });
      setHolding(false);
    } catch {
      setError(t('unholdError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function recStart() {
    if (isPopup) {
      sendCmd('recStart');
      setRecStatus('in-progress');
      return;
    }
    try {
      setError('');
      const sid = getCallSid();
      if (sid) await Api.recStart(sid);
      setRecStatus('in-progress');
    } catch {
      setError(t('recControlError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function recPause() {
    if (isPopup) {
      sendCmd('recPause');
      setRecStatus('paused');
      return;
    }
    try {
      setError('');
      const sid = getCallSid();
      if (sid) await Api.recPause(sid);
      setRecStatus('paused');
    } catch {
      setError(t('recControlError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function recResume() {
    if (isPopup) {
      sendCmd('recResume');
      setRecStatus('in-progress');
      return;
    }
    try {
      setError('');
      const sid = getCallSid();
      if (sid) await Api.recResume(sid);
      setRecStatus('in-progress');
    } catch {
      setError(t('recControlError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function recStop() {
    if (isPopup) {
      sendCmd('recStop');
      setRecStatus('stopped');
      return;
    }
    try {
      setError('');
      const sid = getCallSid();
      if (sid) await Api.recStop(sid);
      setRecStatus('stopped');
    } catch {
      setError(t('recControlError'));
    }
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function acceptIncoming() {
    if (isPopup) {
      setError('');
      try {
        await sendCmd('accept', {}, true);
        setIncomingOpen(false);
        setIncoming(null);
      } catch {
        setError(t('acceptError'));
      }
      return;
    }
    try {
      setError('');
      await incoming?.accept();
      setIncomingOpen(false);
      setIncoming(null);
      setCallStatus('In Call');
      setTimeout(() => publishStateRef.current(), 0);
      return true;
    } catch {
      setError(t('acceptError'));
      setIncomingOpen(false);
      setCallStatus('Idle');
      setIncoming(null);
      setTimeout(() => publishStateRef.current(), 0);
      return false;
    }
  }

  async function rejectIncoming() {
    if (isPopup) {
      setError('');
      try {
        await sendCmd('reject', {}, true);
        setIncomingOpen(false);
        setIncoming(null);
        setCallStatus('Idle');
      } catch {
        setError(t('rejectError'));
      }
      return;
    }
    try {
      setError('');
      await incoming?.reject();
      setIncomingOpen(false);
      setCallStatus('Idle');
      setIncoming(null);
      setTimeout(() => publishStateRef.current(), 0);
      return true;
    } catch {
      setError(t('rejectError'));
      setIncomingOpen(false);
      setCallStatus('Idle');
      setIncoming(null);
      setTimeout(() => publishStateRef.current(), 0);
      return false;
    }
  }

  function sendDtmf(digit) {
    if (isPopup) {
      sendCmd('dtmf', { digit });
    } else {
      try {
        dev?.sendDigits(digit);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function openPopOut() {
    const w = window.open(POPUP_URL, POPUP_NAME, SOFTPHONE_POPUP_FEATURES);
    if (w) {
      popupWinRef.current = w;
      setPopupOpen(true);
      setTimeout(() => publishStateRef.current(), 150);
    }
  }

  function closePopOut() {
    try {
      popupWinRef.current?.close();
    } catch (err) {
      console.error(err);
    }
    popupWinRef.current = null;
    setPopupOpen(false);
  }

  return {
    ready,
    to,
    setTo,
    incoming,
    isIncomingOpen,
    setIncomingOpen,
    callStatus,
    isMuted,
    holding,
    recStatus,
    elapsed,
    error,
    channelError,
    dial,
    hangup,
    toggleMute,
    holdStart,
    holdStop,
    recStart,
    recPause,
    recResume,
    recStop,
    acceptIncoming,
    rejectIncoming,
    sendDtmf,
    openPopOut,
    closePopOut,
    popupOpen,
    setError,
    setChannelError,
  };
}
