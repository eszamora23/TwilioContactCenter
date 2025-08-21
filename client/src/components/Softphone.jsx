// contact-center/client/src/components/Softphone.jsx
import { useState } from 'react';
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
import { MicrophoneOnIcon } from '@twilio-paste/icons/esm/MicrophoneOnIcon';
import { MicrophoneOffIcon } from '@twilio-paste/icons/esm/MicrophoneOffIcon';

import { useSoftphone } from '../softphone/useSoftphone.js';
import DialPad from '../softphone/components/DialPad.jsx';
import IncomingModal from '../softphone/components/IncomingModal.jsx';
import DtmfModal from '../softphone/components/DtmfModal.jsx';
import PopOutButton from '../softphone/components/PopOutButton.jsx';

export default function Softphone({ remoteOnly }) {
  const { t } = useTranslation();
  const {
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
  } = useSoftphone();

  const [isDtmfOpen, setIsDtmfOpen] = useState(false);

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
      <style>{`
        .sf__body { flex: 1; min-height: 0; display: grid; gap: var(--paste-space-70); }
        @media (min-width: 768px) { .sf__body { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 767px) { .sf__body { grid-template-columns: 1fr; } }
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
          <PopOutButton onClick={openPopOut} />
        </Stack>
      </Stack>

      <Separator orientation="horizontal" verticalSpacing="space50" />

      <Box className="sf__body">
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

        <Box>
          <Heading as="h4" variant="heading40" marginBottom="space50">
            {t('dtmfKeypad')}
          </Heading>
          <DialPad disabled={callStatus !== 'In Call'} onDigit={sendDtmf} />
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
