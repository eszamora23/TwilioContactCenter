import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSoftphone from '../hooks/useSoftphone.js';
import DialPad from './DialPad.jsx';
import IncomingModal from './IncomingModal.jsx';
import DtmfModal from './DtmfModal.jsx';
import CallControlBar from './CallControlBar.jsx';
import SoftphoneLayout from './SoftphoneLayout.jsx';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Input } from '@twilio-paste/core/input';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';
import { Alert } from '@twilio-paste/core/alert';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Separator } from '@twilio-paste/core/separator';
import { HelpText } from '@twilio-paste/core/help-text';
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

  const layout = (
    <>
      <Box className={styles.header}>
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
      </Box>

      <Box className={styles.controls}>
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

        <CallControlBar
          callStatus={callStatus}
          isMuted={isMuted}
          holding={holding}
          recStatus={recStatus}
          hangup={hangup}
          toggleMute={toggleMute}
          holdStart={holdStart}
          holdStop={holdStop}
          recStart={recStart}
          recPause={recPause}
          recResume={recResume}
          recStop={recStop}
          onOpenDtmf={() => setIsDtmfOpen(true)}
        />

        <HelpText variant="default">{isMuted ? t('micMuted') : t('micLive')}</HelpText>
        <HelpText variant="default">
          {t('hold')}: {holding ? t('yes') : t('no')}
        </HelpText>
        <HelpText variant="default">
          {t('recording')}: {recStatus}
        </HelpText>
      </Box>

      <Box className={styles.dialpad}>
        <Heading as="h4" variant="heading40" marginBottom="space50">
          {t('dtmfKeypad')}
        </Heading>
        <DialPad onDigit={sendDtmf} disabled={callStatus !== 'In Call'} />
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
    </>
  );

  return remoteOnly ? layout : <SoftphoneLayout>{layout}</SoftphoneLayout>;
}
