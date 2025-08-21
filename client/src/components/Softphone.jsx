// contact-center/client/src/components/Softphone.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { VoiceDevice } from '../softphone/VoiceDevice.js';
import { useTranslation } from 'react-i18next';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Input } from '@twilio-paste/core/input';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';
import { Tooltip } from '@twilio-paste/core/tooltip';
import { Alert } from '@twilio-paste/core/alert';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Separator } from '@twilio-paste/core/separator';
import { HelpText } from '@twilio-paste/core/help-text';
import {
  Modal,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from '@twilio-paste/core/modal';
import { MicrophoneOnIcon } from '@twilio-paste/icons/esm/MicrophoneOnIcon';
import { MicrophoneOffIcon } from '@twilio-paste/icons/esm/MicrophoneOffIcon';

/* =========================
 *        Softphone
 * ========================= */
export default function Softphone() {
  const { t } = useTranslation();

  const [dev] = useState(() => new VoiceDevice());
  const [ready, setReady] = useState(false);

  const [to, setTo] = useState('');
  const [incoming, setIncoming] = useState(null);
  const [isIncomingOpen, setIncomingOpen] = useState(false);
  const [isDtmfOpen, setIsDtmfOpen] = useState(false);

  const [callStatus, setCallStatus] = useState('Idle'); // Idle | Incoming | In Call
  const [isMuted, setIsMuted] = useLocalStorage('mute_state', false);
  const [callStart, setCallStart] = useState(null);
  const [error, setError] = useState('');

  const tickRef = useRef(null);
  const [, force] = useState(0);

  // BroadcastChannel para sincronizar con popup
  const chanRef = useRef(null);
  const POPUP_NAME = 'softphone_popup';
  const POPUP_URL = `${window.location.origin}?popup=softphone`;
  const [popupOpen, setPopupOpen] = useState(false);
  const popupWinRef = useRef(null);

  // Elapsed mm:ss
  const elapsed = useMemo(() => {
    if (!callStart) return '00:00';
    const sec = Math.floor((Date.now() - callStart) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }, [callStart, force]);

  /* ====== publicar estado para el popup ====== */
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

  /* ====== Device lifecycle ====== */
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

  /* ====== BroadcastChannel setup ====== */
  useEffect(() => {
    const ch = new BroadcastChannel('softphone-control');
    chanRef.current = ch;

    ch.onmessage = async (evt) => {
      const { type, payload } = evt.data || {};
      if (type !== 'cmd') return;
      try {
        if (payload.action === 'ping') {
          // popup pide estado inicial
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

    // cleanup
    return () => { try { ch.close(); } catch {} };
  }, [publishState]); // make sure we use the latest publisher

  // emite estado cuando cambian dependencias importantes
  useEffect(() => { publishState(); }, [publishState]);

  // si el popup cierra, reflejar estado
  useEffect(() => {
    const iv = setInterval(() => {
      if (popupOpen && popupWinRef.current && popupWinRef.current.closed) {
        setPopupOpen(false);
        popupWinRef.current = null;
      }
    }, 800);
    return () => clearInterval(iv);
  }, [popupOpen]);

  /* =========================
   *        Actions
   * ========================= */
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
      await dev.mute(next);
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
    try { dev?.sendDigits(digit); } catch {}
  }

  // Abre popup control (UI remota). La llamada sigue en ESTA ventana.
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
      // empuja estado inicial
      setTimeout(() => publishState(), 150);
    }
  }

  if (!ready) return <SkeletonLoader />;

  /* =========================
   *          UI
   * ========================= */
  return (
    <Box
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
      display="flex"
      flexDirection="column"
      height="100%"
      minHeight="0"
    >
      <style>{`
        .sf__body { flex: 1; min-height: 0; display: grid; gap: var(--paste-space-70); }
        @media (min-width: 768px) { .sf__body { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 767px) { .sf__body { grid-template-columns: 1fr; } }
        .sf__key { width: 100%; height: 48px; }
        .sf__padGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--paste-space-40); }
        .sf__pill { border-radius: 9999px; padding: 2px 10px; background: var(--paste-color-backgroundStrong); }
      `}</style>

      {error ? (
        <Box marginBottom="space50">
          <Alert variant="error">{error}</Alert>
        </Box>
      ) : null}

      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        distribution="spaceBetween"
        alignment="center"
        style={{ flexWrap: 'wrap' }}
      >
        <Heading as="h3" variant="heading30" margin="space0">
          {t('softphone')}
        </Heading>

        <Stack orientation="horizontal" spacing="space50" style={{ flexWrap: 'wrap' }}>
          <Box>
            <Badge as="span" variant="success">{t('registered')}</Badge>
          </Box>
          <Separator orientation="vertical" />
          <Box>
            <Badge
              as="span"
              variant={callStatus === 'In Call' ? 'new' : callStatus === 'Incoming' ? 'warning' : 'neutral'}
            >
              {t('call')}: {callStatus}
            </Badge>
          </Box>
          {callStatus === 'In Call' ? <Box className="sf__pill">⏱ {elapsed}</Box> : null}
          <Button variant="secondary" onClick={openPopOut}>Pop out</Button>
        </Stack>
      </Stack>

      <Separator orientation="horizontal" verticalSpacing="space50" />

      <Box className="sf__body">
        {/* Dialer & Controls */}
        <Box display="flex" flexDirection="column" gap="space60" minHeight="0">
          <Stack orientation={['vertical', 'horizontal']} spacing="space50" style={{ flexWrap: 'wrap' }}>
            <Input
              placeholder={t('dialPlaceholder')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              size="default"
            />
            <Button
              variant="primary"
              onClick={() => dial()}
              disabled={!to.trim() || callStatus === 'In Call'}
              aria-label={t('callAria')}
              title={t('callAria')}
            >
              {t('call')}
            </Button>
          </Stack>

          <Stack orientation={['vertical', 'horizontal']} spacing="space50" style={{ flexWrap: 'wrap' }}>
            <Tooltip text={t('toggleMuteTooltip')}>
              <Button
                variant="secondary"
                onClick={() => toggleMute(!isMuted)}
                aria-pressed={isMuted}
                aria-label={isMuted ? t('unmuteAria') : t('muteAria')}
                title={isMuted ? t('unmuteAria') : t('muteAria')}
              >
                {isMuted ? (<><MicrophoneOffIcon decorative /> {t('unmute')}</>) : (<><MicrophoneOnIcon decorative /> {t('mute')}</>)}
              </Button>
            </Tooltip>

            <Button
              variant="destructive"
              onClick={hangup}
              disabled={callStatus !== 'In Call' && callStatus !== 'Incoming'}
              aria-label={t('hangupAria')}
              title={t('hangupAria')}
            >
              {t('hangup')}
            </Button>

            <Button
              variant="secondary"
              onClick={() => setIsDtmfOpen(true)}
              disabled={callStatus !== 'In Call'}
              aria-label={t('dtmfAria')}
              title={t('dtmfAria')}
            >
              {t('dtmf')}
            </Button>
          </Stack>

          <HelpText variant="default">{isMuted ? t('micMuted') : t('micLive')}</HelpText>
        </Box>

        {/* Keypad */}
        <Box>
          <Heading as="h4" variant="heading40" marginBottom="space50">
            {t('dtmfKeypad')}
          </Heading>
          <Box className="sf__padGrid">
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map((d) => (
              <Button
                key={d}
                variant="secondary"
                className="sf__key"
                aria-label={`${t('dial')} ${d}`}
                title={`${t('dial')} ${d}`}
                onClick={() => sendDtmf(d)}
                disabled={callStatus !== 'In Call'}
              >
                {d}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Incoming modal */}
      <Modal isOpen={isIncomingOpen} onDismiss={() => setIncomingOpen(false)} ariaLabel="incoming-call" size="default">
        <ModalHeader><ModalHeading>{t('incomingCall')}</ModalHeading></ModalHeader>
        <ModalBody>{t('acceptIncomingPrompt')}</ModalBody>
        <ModalFooter>
          <Stack orientation="horizontal" spacing="space40">
            <Button variant="secondary" onClick={rejectIncoming} aria-label={t('rejectAria')} title={t('rejectAria')}>
              {t('reject')}
            </Button>
            <Button variant="primary" onClick={acceptIncoming} aria-label={t('acceptAria')} title={t('acceptAria')}>
              {t('accept')}
            </Button>
          </Stack>
        </ModalFooter>
      </Modal>

      {/* DTMF modal */}
      <Modal isOpen={isDtmfOpen} onDismiss={() => setIsDtmfOpen(false)} ariaLabel="dtmf-keypad" size="default">
        <ModalHeader><ModalHeading>{t('dtmfKeypad')}</ModalHeading></ModalHeader>
        <ModalBody>
          <Box className="sf__padGrid">
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map((d) => (
              <Button
                key={d}
                variant="secondary"
                className="sf__key"
                aria-label={`${t('dial')} ${d}`}
                title={`${t('dial')} ${d}`}
                onClick={() => sendDtmf(d)}
                disabled={callStatus !== 'In Call'}
              >
                {d}
              </Button>
            ))}
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsDtmfOpen(false)} aria-label={t('close')} title={t('close')}>
            {t('close')}
          </Button>
        </ModalFooter>
      </Modal>
    </Box>
  );
}
