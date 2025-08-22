import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSoftphone from '../hooks/useSoftphone.js';
import DialPad from './DialPad.jsx';
import IncomingModal from './IncomingModal.jsx';
import DtmfModal from './DtmfModal.jsx';

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
import { MicrophoneOnIcon } from '@twilio-paste/icons/esm/MicrophoneOnIcon';
import { MicrophoneOffIcon } from '@twilio-paste/icons/esm/MicrophoneOffIcon';
import styles from './Softphone.module.css';

export default function Softphone({ remoteOnly, popupOpen = false }) {
  const { t } = useTranslation();
  const {
    ready,
    to,
    setTo,
    isIncomingOpen,
    setIncomingOpen,
    callStatus,
    isMuted,
    holding,
    recStatus,
    elapsed,
    error,
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
  } = useSoftphone(remoteOnly);

  const [isDtmfOpen, setIsDtmfOpen] = useState(false);

  if (!remoteOnly && popupOpen) return null;
  if (!ready) return <SkeletonLoader />;

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
          {callStatus === 'In Call' ? <Box className={styles.pill}>⏱ {elapsed}</Box> : null}
        </Stack>
      </Stack>

      <Separator orientation="horizontal" verticalSpacing="space50" />

      <Box className={styles.body}>
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

            <Button
              variant="secondary"
              onClick={holding ? holdStop : holdStart}
              disabled={callStatus !== 'In Call'}
              aria-label={holding ? t('resumeAria') : t('holdAria')}
              title={holding ? t('resumeAria') : t('holdAria')}
            >
              {holding ? t('resume') : t('hold')}
            </Button>

            <Button
              variant="secondary"
              onClick={recStart}
              disabled={
                callStatus !== 'In Call' || (recStatus !== 'inactive' && recStatus !== 'stopped')
              }
              aria-label={t('startRecAria')}
              title={t('startRecTitle')}
            >
              {t('startRecTitle')}
            </Button>

            <Button
              variant="secondary"
              onClick={recPause}
              disabled={recStatus !== 'in-progress'}
              aria-label={t('pauseRecAria')}
              title={t('pauseRecTitle')}
            >
              {t('pauseRecTitle')}
            </Button>

            <Button
              variant="secondary"
              onClick={recResume}
              disabled={recStatus !== 'paused'}
              aria-label={t('resumeRecAria')}
              title={t('resumeRecTitle')}
            >
              {t('resumeRecTitle')}
            </Button>

            <Button
              variant="secondary"
              onClick={recStop}
              disabled={recStatus === 'inactive'}
              aria-label={t('stopRecAria')}
              title={t('stopRecTitle')}
            >
              {t('stopRecTitle')}
            </Button>
          </Stack>

          <HelpText variant="default">{isMuted ? t('micMuted') : t('micLive')}</HelpText>
          <HelpText variant="default">
            {t('hold')}: {holding ? t('yes') : t('no')}
          </HelpText>
          <HelpText variant="default">
            {t('recording')}: {recStatus}
          </HelpText>
        </Box>

        <Box>
          <Heading as="h4" variant="heading40" marginBottom="space50">
            {t('dtmfKeypad')}
          </Heading>
          <DialPad onDigit={sendDtmf} disabled={callStatus !== 'In Call'} />
        </Box>
      </Box>

      <IncomingModal
        isOpen={isIncomingOpen}
        onAccept={acceptIncoming}
        onReject={rejectIncoming}
        onDismiss={() => setIncomingOpen(false)}
      />

      <DtmfModal
        isOpen={isDtmfOpen}
        onDismiss={() => setIsDtmfOpen(false)}
        onDigit={sendDtmf}
        disabled={callStatus !== 'In Call'}
      />
    </Box>
  );
}
