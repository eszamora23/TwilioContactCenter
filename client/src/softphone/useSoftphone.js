import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { VoiceDevice } from './VoiceDevice.js';
import { useTranslation } from 'react-i18next';

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });
  const setValue = (value) => {
    try {
      const next = value instanceof Function ? value(storedValue) : value;
      setStoredValue(next);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return [storedValue, setValue];
}

export function useSoftphone() {
  const { t } = useTranslation();
  const [dev] = useState(() => new VoiceDevice());
  const [ready, setReady] = useState(false);

  const [to, setTo] = useState('');
  const [incoming, setIncoming] = useState(null);
  const [isIncomingOpen, setIncomingOpen] = useState(false);
  const [callStatus, setCallStatus] = useState('Idle');
  const [isMuted, setIsMuted] = useLocalStorage('mute_state', false);
  const [callStart, setCallStart] = useState(null);
  const [error, setError] = useState('');

  const tickRef = useRef(null);
  const [, force] = useState(0);

  const chanRef = useRef(null);
  const POPUP_NAME = 'softphone_popup';
  const POPUP_URL = `${window.location.origin}?popup=softphone`;
  const [popupOpen, setPopupOpen] = useState(false);
  const popupWinRef = useRef(null);

  const elapsed = useMemo(() => {
    if (!callStart) return '00:00';
    const sec = Math.floor((Date.now() - callStart) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }, [callStart, force]);

  const publishState = useCallback(() => {
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
    } catch {}
  }, [ready, callStatus, isMuted, to, elapsed, incoming]);

  useEffect(() => {
    const boot = async () => {
      dev.onIncoming = (call) => {
        setIncoming(call);
        setIncomingOpen(true);
        setCallStatus('Incoming');
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
      };

      dev.onMuteSync = (muteState) => setIsMuted(muteState);

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
  }, []);

  useEffect(() => {
    const ch = new BroadcastChannel('softphone-control');
    chanRef.current = ch;

    ch.onmessage = async (evt) => {
      const { type, payload } = evt.data || {};
      if (type !== 'cmd') return;
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
      } catch (e) {
        console.error('[softphone cmd error]', e);
      } finally {
        publishState();
      }
    };

    return () => { try { ch.close(); } catch {} };
  }, [publishState]);

  useEffect(() => { publishState(); }, [publishState]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (popupOpen && popupWinRef.current && popupWinRef.current.closed) {
        setPopupOpen(false);
        popupWinRef.current = null;
      }
    }, 800);
    return () => clearInterval(iv);
  }, [popupOpen]);

  async function dial(num = to) {
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
  }

  async function hangup() {
    try {
      setError('');
      await dev.disconnect();
    } catch {
      setError(t('hangupError'));
    }
    setCallStatus('Idle');
    setIsMuted(false);
  }

  async function toggleMute(next) {
    try {
      setError('');
      await dev.current?.mute(next);
      setIsMuted(next);
    } catch {
      setError(t('muteError'));
    }
  }

  async function acceptIncoming() {
    try {
      setError('');
      await incoming?.accept();
      setIncomingOpen(false);
      setCallStatus('In Call');
    } catch {
      setError(t('acceptError'));
      setIncomingOpen(false);
      setCallStatus('Idle');
    }
  }

  async function rejectIncoming() {
    try {
      setError('');
      await incoming?.reject();
    } catch {
      setError(t('rejectError'));
    }
    setIncomingOpen(false);
    setCallStatus('Idle');
  }

  function sendDtmf(digit) {
    try { dev.current?.sendDigits(digit); } catch {}
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
      setTimeout(() => publishState(), 150);
    }
  }

  return {
    ready,
    to,
    setTo,
    callStatus,
    isMuted,
    dial,
    hangup,
    toggleMute,
    sendDtmf,
    acceptIncoming,
    rejectIncoming,
    isIncomingOpen,
    setIncomingOpen,
    elapsed,
    openPopOut,
    error,
  };
}

