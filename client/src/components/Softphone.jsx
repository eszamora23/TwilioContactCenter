// contact-center/client/src/components/Softphone.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { VoiceDevice } from '../softphone/VoiceDevice.js';
import { useTranslation } from 'react-i18next';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Input } from '@twilio-paste/core/input';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';
import { Tooltip } from '@twilio-paste/core/tooltip';
import { Alert } from '@twilio-paste/core/alert';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { MicrophoneOnIcon } from '@twilio-paste/icons/esm/MicrophoneOnIcon';
import { MicrophoneOffIcon } from '@twilio-paste/icons/esm/MicrophoneOffIcon';
import {
  Modal,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from '@twilio-paste/core/modal';
import { Separator } from '@twilio-paste/core/separator';
import { HelpText } from '@twilio-paste/core/help-text';
import { Grid } from '@twilio-paste/core/grid';

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

export default function Softphone() {
  const { t } = useTranslation();
  const [dev] = useState(() => new VoiceDevice());
  const [ready, setReady] = useState(false);
  const [to, setTo] = useState('');
  const [incoming, setIncoming] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDtmfOpen, setIsDtmfOpen] = useState(false);

  const [callStatus, setCallStatus] = useState('Idle'); // Idle | Incoming | In Call
  const [isMuted, setIsMuted] = useLocalStorage('mute_state', false);
  const [callStart, setCallStart] = useState(null);
  const intervalRef = useRef(null);
  const [, forceRerender] = useState(0);
  const [error, setError] = useState('');

  const elapsed = useMemo(() => {
    if (!callStart) return '00:00';
    const sec = Math.floor((Date.now() - callStart) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }, [callStart, forceRerender]);

  useEffect(() => {
    const run = async () => {
      dev.onIncoming = (call) => {
        setIncoming(call);
        setIsOpen(true);
        setCallStatus('Incoming');
      };
      dev.onStatusChange = (status) => {
        setCallStatus(status);
        if (status === 'In Call') {
          setCallStart(Date.now());
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(() => forceRerender((x) => x + 1), 1000);
        }
        if (status === 'Idle') {
          setCallStart(null);
          setIsMuted(false); // limpiar mute al finalizar
          clearInterval(intervalRef.current);
        }
      };

      try {
        await dev.register();
        setReady(true);
      } catch (e) {
        setError(t('registrationError'));
      }
    };
    run().catch((e) => {
      console.error(e);
      setError(t('generalError'));
    });
    return () => {
      clearInterval(intervalRef.current);
      dev.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptIncoming() {
    try {
      setError('');
      await incoming?.accept();
      setIsOpen(false);
      setCallStatus('In Call');
    } catch (e) {
      console.error(e);
      setError(t('acceptError'));
      setIsOpen(false);
      setCallStatus('Idle');
    }
  }

  async function rejectIncoming() {
    try {
      setError('');
      await incoming?.reject();
    } catch (e) {
      console.error(e);
      setError(t('rejectError'));
    }
    setIsOpen(false);
    setCallStatus('Idle');
  }

  async function toggleMute(next) {
    try {
      setError('');
      await dev.mute(next);
      setIsMuted(next);
    } catch (e) {
      console.error('mute error', e);
      setError(t('muteError'));
    }
  }

  async function hangup() {
    try {
      setError('');
      await dev.disconnect();
    } catch (e) {
      console.error(e);
      setError(t('hangupError'));
    }
    setCallStatus('Idle');
    setIsMuted(false);
  }

  async function dial() {
    try {
      setError('');
      const call = await dev.dial(to);
      if (call) {
        setIsOpen(false);
        setCallStatus('In Call');
      }
    } catch (e) {
      console.error('dial error', e);
      setError(t('dialError'));
    }
  }

  function sendDtmf(digit) {
    if (dev) {
      dev.sendDigits(digit);
    }
  }

  if (!ready) {
    return <SkeletonLoader />;
  }

  return (
    <Box padding="space60" backgroundColor="colorBackground" borderRadius="borderRadius30" boxShadow="shadow">
      {error && <Alert variant="error">{error}</Alert>}
      <Stack orientation="vertical" spacing="space40">
        <Stack orientation={['vertical', 'horizontal']} spacing="space50" alignment="center">
          <Box>
            {t('softphone')}:{' '}
            <Badge as="span" variant={ready ? 'success' : 'neutral'}>
              {ready ? t('registered') : t('registering')}
            </Badge>
          </Box>
          <Separator orientation="vertical" />
          <Box>
            {t('call')}:{' '}
            <Badge
              as="span"
              variant={callStatus === 'In Call' ? 'new' : callStatus === 'Incoming' ? 'warning' : 'neutral'}
            >
              {callStatus}
            </Badge>
          </Box>
          {callStatus === 'In Call' ? <Box>⏱ {elapsed}</Box> : null}
        </Stack>

        <Stack orientation={['vertical', 'horizontal']} spacing="space50">
          <Input
            placeholder={t('dialPlaceholder')}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button
            aria-label={t('callAria')}
            title={t('callAria')}
            variant="primary"
            disabled={!ready || !to}
            onClick={dial}
          >
            {t('call')}
          </Button>

          <Tooltip text={t('toggleMuteTooltip')}>
            <Button
              aria-label={isMuted ? t('unmuteAria') : t('muteAria')}
              title={isMuted ? t('unmuteAria') : t('muteAria')}
              aria-pressed={isMuted}
              variant="secondary"
              disabled={!dev}
              onClick={() => toggleMute(!isMuted)}
            >
              {isMuted ? (
                <>
                  <MicrophoneOffIcon decorative /> {t('unmute')}
                </>
              ) : (
                <>
                  <MicrophoneOnIcon decorative /> {t('mute')}
                </>
              )}
            </Button>
          </Tooltip>

          <Button
            aria-label={t('hangupAria')}
            title={t('hangupAria')}
            variant="destructive"
            disabled={!dev}
            onClick={hangup}
          >
            {t('hangup')}
          </Button>

          {callStatus === 'In Call' && (
            <Button
              aria-label={t('dtmfAria')}
              title={t('dtmfAria')}
              variant="secondary"
              onClick={() => setIsDtmfOpen(true)}
            >
              {t('dtmf')}
            </Button>
          )}
        </Stack>

        <Grid gutter="space30" templateColumns="repeat(3, 1fr)">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
            <Button
              key={digit}
              variant="secondary"
              aria-label={`${t('dial')} ${digit}`}
              title={`${t('dial')} ${digit}`}
              onClick={() => setTo((prev) => prev + digit)}
            >
              {digit}
            </Button>
          ))}
        </Grid>

        {dev ? (
          <HelpText variant="default">{isMuted ? t('micMuted') : t('micLive')}</HelpText>
        ) : null}
      </Stack>

      <Modal isOpen={isOpen} onDismiss={() => setIsOpen(false)} ariaLabel="incoming-call" size="default">
        <ModalHeader>
          <ModalHeading>{t('incomingCall')}</ModalHeading>
        </ModalHeader>
        <ModalBody>{t('acceptIncomingPrompt')}</ModalBody>
        <ModalFooter>
          <Stack orientation="horizontal" spacing="space40">
            <Button
              aria-label={t('rejectAria')}
              title={t('rejectAria')}
              variant="secondary"
              onClick={rejectIncoming}
            >
              {t('reject')}
            </Button>
            <Button
              aria-label={t('acceptAria')}
              title={t('acceptAria')}
              variant="primary"
              onClick={acceptIncoming}
            >
              {t('accept')}
            </Button>
          </Stack>
        </ModalFooter>
      </Modal>

      <Modal isOpen={isDtmfOpen} onDismiss={() => setIsDtmfOpen(false)} ariaLabel="dtmf-keypad" size="default">
        <ModalHeader>
          <ModalHeading>{t('dtmfKeypad')}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Grid gutter="space30">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <Button
                key={digit}
                variant="secondary"
                aria-label={`${t('dial')} ${digit}`}
                title={`${t('dial')} ${digit}`}
                onClick={() => sendDtmf(digit)}
              >
                {digit}
              </Button>
            ))}
          </Grid>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            aria-label={t('close')}
            title={t('close')}
            onClick={() => setIsDtmfOpen(false)}
          >
            {t('close')}
          </Button>
        </ModalFooter>
      </Modal>
    </Box>
  );
}
