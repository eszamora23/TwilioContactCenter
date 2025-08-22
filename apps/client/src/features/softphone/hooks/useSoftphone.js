import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';
import { VoiceDevice } from '../services/VoiceDevice.js';
import { getCallSid } from '../services/callSidStore.js';
import Api from '../../index.js';

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
      chanRef.current?.postMessage({
        type: 'state',
        payload: {
          ready,
          callStatus,
          isMuted,
          to,
          elapsed,
          hasIncoming: !!incoming,
        },
      });
    } catch (e) {
      console.warn('[softphone channel state error]', e);
      setChannelError(true);
      setUseStorageFallback(true);
    }
  }, [ready, callStatus, isMuted, to, elapsed, incoming, isPopup]);

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
      Api.recStatus(sid).catch(() => {
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
          if (id) pendingRef.current[id] = { resolve, reject };
          chanRef.current?.postMessage({ type: 'cmd', payload: { action, ...extra }, id });
          if (!id) resolve();
        } catch (e) {
          console.warn('[softphone channel cmd error]', e);
          setChannelError(true);
          setUseStorageFallback(true);
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
        setTimeout(() => publishStateRef.current(), 0);
      };
      dev.onStatusChange = (status) => {
        setCallStatus(status);
        if (status === 'In Call') {
          setCallStart(Date.now());
          clearInterval(tickRef.current);
          tickRef.current = setInterval(() => force((x) => x + 1), 1000);
        }
        if (status === 'Idle') {
          setCallStart(null);
          setIsMuted(false);
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
      dev.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPopup]);

  // BroadcastChannel or fallback channel setup
  useEffect(() => {
    const KEY = 'softphone-control';
    let ch;
    let usingStorage = useStorageFallback;

    if (!usingStorage && typeof window !== 'undefined' && typeof BroadcastChannel === 'function') {
      try {
        ch = new BroadcastChannel(KEY);
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
        if (e.key === KEY && e.newValue) {
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
            localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), ...msg }));
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

    ch.onmessage = async (evt) => {
      const { type, payload, id, ok } = evt.data || {};
      if (isPopup) {
        if (type === 'state') {
          setReady(!!payload.ready);
          setCallStatus(payload.callStatus || 'Idle');
          setIsMuted(!!payload.isMuted);
          setTo(payload.to || '');
          setIncoming(payload.hasIncoming ? {} : null);
          setIncomingOpen(!!payload.hasIncoming);
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
        } else if (type === 'resp' && id && pendingRef.current[id]) {
          const { resolve, reject } = pendingRef.current[id];
          delete pendingRef.current[id];
          if (ok) resolve();
          else reject(new Error('cmd failed'));
        }
        return;
      }
      if (type === 'popup-closed') {
        setPopupOpen(false);
        popupWinRef.current = null;
        return;
      }

      if (type !== 'cmd') return;
      let success = true;
      try {
        if (payload.action === 'ping') {
          publishState();
          return;
        }
        if (payload.action === 'dial') {
          const num = String(payload.to || '').trim();
          if (num) {
            setTo(num);
            await dial(num);
          }
        }
        if (payload.action === 'hangup') await hangup();
        if (payload.action === 'mute') await toggleMute(true);
        if (payload.action === 'unmute') await toggleMute(false);
        if (payload.action === 'dtmf' && payload.digit) sendDtmf(String(payload.digit));
        if (payload.action === 'accept') success = await acceptIncoming();
        if (payload.action === 'reject') success = await rejectIncoming();
      } catch (e) {
        console.error('[softphone cmd error]', e);
        success = false;
      } finally {
        publishState();
        if (id) {
          try {
            ch.postMessage({ type: 'resp', id, ok: success });
          } catch (e) {
            console.warn('[softphone channel resp error]', e);
          }
        }
      }
    };

    if (isPopup) {
      try {
        ch.postMessage({ type: 'cmd', payload: { action: 'ping' } });
      } catch (e) {
        console.warn('[softphone channel ping error]', e);
        setChannelError(true);
        setUseStorageFallback(true);
      }
    }

    return () => {
      try {
        ch.close();
      } catch (e) {
        console.warn('[softphone channel close error]', e);
      }
      clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [publishState, isPopup, useStorageFallback]);

  useEffect(() => { if (!isPopup) publishState(); }, [publishState, isPopup]);

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
      if (dev) await dev.disconnect();
      if (sid) await Api.hangup(sid);
    } catch {
      setError(t('hangupError'));
    }
    setCallStatus('Idle');
    setIsMuted(false);
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
      try { dev?.sendDigits(digit); } catch {}
    }
  }

  function openPopOut() {
    const w = window.open(
      POPUP_URL,
      POPUP_NAME,
      [
        'width=420',
        'height=640',
        'menubar=no',
        'toolbar=no',
        'resizable=yes',
        'status=no',
        'scrollbars=yes',
      ].join(',')
    );
    if (w) {
      popupWinRef.current = w;
      setPopupOpen(true);
      setTimeout(() => publishStateRef.current(), 150);
    }
  }

  function closePopOut() {
    try {
      popupWinRef.current?.close();
    } catch {}
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
    elapsed,
    error,
    channelError,
    dial,
    hangup,
    toggleMute,
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
