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

  const [dev] = useState(() => (remoteOnly ? null : new VoiceDevice()));
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
    if (remoteOnly) return;
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
  }, [ready, callStatus, isMuted, to, elapsed, incoming, remoteOnly]);

  const publishStateRef = useRef(publishState);
  useEffect(() => {
    publishStateRef.current = publishState;
  }, [publishState]);

  const sendCmd = useCallback((action, extra = {}) => {
    try {
      chanRef.current?.postMessage({ type: 'cmd', payload: { action, ...extra } });
    } catch {}
  }, []);

  // Device lifecycle
  useEffect(() => {
    if (remoteOnly) return undefined;
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
  }, [remoteOnly]);

  // BroadcastChannel setup
  useEffect(() => {
    const ch = new BroadcastChannel('softphone-control');
    chanRef.current = ch;

    ch.onmessage = async (evt) => {
      const { type, payload } = evt.data || {};
      if (remoteOnly) {
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
        }
        return;
      }

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
        if (payload.action === 'accept') await acceptIncoming();
        if (payload.action === 'reject') await rejectIncoming();
      } catch (e) {
        console.error('[softphone cmd error]', e);
      } finally {
        publishState();
      }
    };

    if (remoteOnly) {
      try { ch.postMessage({ type: 'cmd', payload: { action: 'ping' } }); } catch {}
    }

    return () => {
      try { ch.close(); } catch {}
      clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [publishState, remoteOnly]);

  useEffect(() => { if (!remoteOnly) publishState(); }, [publishState, remoteOnly]);

  useEffect(() => {
    if (remoteOnly) return undefined;
    const iv = setInterval(() => {
      if (popupOpen && popupWinRef.current && popupWinRef.current.closed) {
        setPopupOpen(false);
        popupWinRef.current = null;
      }
    }, 800);
    return () => clearInterval(iv);
  }, [popupOpen, remoteOnly]);

  async function dial(num = to) {
    if (remoteOnly) {
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
    if (remoteOnly) {
      sendCmd('hangup');
      setCallStatus('Idle');
      setIsMuted(false);
      return;
    }
    try {
      setError('');
      const sid = getCallSid();
      await dev.disconnect();
      await Api.hangup(sid);
    } catch {
      setError(t('hangupError'));
    }
    setCallStatus('Idle');
    setIsMuted(false);
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function toggleMute(next) {
    if (remoteOnly) {
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
    if (remoteOnly) {
      sendCmd('accept');
      setIncomingOpen(false);
      return;
    }
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
    setTimeout(() => publishStateRef.current(), 0);
  }

  async function rejectIncoming() {
    if (remoteOnly) {
      sendCmd('reject');
      setIncomingOpen(false);
      return;
    }
    try {
      setError('');
      await incoming?.reject();
    } catch {
      setError(t('rejectError'));
    }
    setIncomingOpen(false);
    setCallStatus('Idle');
    setTimeout(() => publishStateRef.current(), 0);
  }

  function sendDtmf(digit) {
    if (remoteOnly) {
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
    dial,
    hangup,
    toggleMute,
    acceptIncoming,
    rejectIncoming,
    sendDtmf,
    openPopOut,
    setError,
  };
}
