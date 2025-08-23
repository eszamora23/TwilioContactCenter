// contact-center/client/src/features/softphone/components/Softphone.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSoftphone from '../hooks/useSoftphone.js';
import useCallControls from './useCallControls.js';
import DialPad from './DialPad.jsx';
import IncomingModal from './IncomingModal.jsx';
import DtmfModal from './DtmfModal.jsx';
import CallControlBar from './CallControlBar.jsx';
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
import { Flex } from '@twilio-paste/core/flex';
import { SuccessIcon } from '@twilio-paste/icons/esm/SuccessIcon';
import { WarningIcon } from '@twilio-paste/icons/esm/WarningIcon';
import { ErrorIcon } from '@twilio-paste/icons/esm/ErrorIcon';
import styles from './Softphone.module.css';

export default function Softphone({ remoteOnly = false, popupOpen = false }) {
  const isPopup = remoteOnly === true; // full-height only inside the popup
  const { t } = useTranslation();
  const softphone = useSoftphone(remoteOnly);
  const {
    ready,
    to,
    setTo,
    isIncomingOpen,
    setIncomingOpen,
    elapsed,
    error,
    dial,
    acceptIncoming,
    rejectIncoming,
    sendDtmf,
  } = softphone;
  const {
    callStatus,
    isMuted,
    holding,
    recStatus,
    hangup,
    toggleMute,
    holdStart,
    holdStop,
    recStart,
    recPause,
    recResume,
    recStop,
  } = useCallControls(softphone);
  const [isDtmfOpen, setIsDtmfOpen] = useState(false);

  // Hide inline softphone if popup is pinned/open
  if (!remoteOnly && popupOpen) return null;
  if (!ready) return <SkeletonLoader />;

  return (
    <Box
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
      className={styles.layout}
      // in main app: let card size naturally; in popup: keep immersive height
      minHeight={isPopup ? '100vh' : undefined}
    >
      {error ? (
        <Box marginBottom="space50">
          <Alert variant="error">{error}</Alert>
        </Box>
      ) : null}

      {/* Header: Status Overview */}
      <Box className={styles.header}>
        <Flex
          justifyContent="space-between"
          alignItems="center"
          columnGap="space50"
          style={{ flexWrap: 'wrap' }}
        >
          <Heading as="h3" variant="heading30" margin="space0">
            {t('softphone')}
          </Heading>
          <Flex alignItems="center" columnGap="space50" style={{ flexWrap: 'wrap' }}>
            <Flex alignItems="center" columnGap="space40" style={{ flexWrap: 'wrap' }}>
              <Badge as="span" variant="success">
                <SuccessIcon decorative size="sizeIcon10" /> {t('registered')}
              </Badge>
              {callStatus === 'In Call' ? <Box className={styles.pill}>⏱ {elapsed}</Box> : null}
            </Flex>
            <Separator orientation="vertical" />
            <Badge
              as="span"
              variant={
                callStatus === 'In Call'
                  ? 'success'
                  : callStatus === 'Incoming'
                  ? 'warning'
                  : 'error'
              }
            >
              {callStatus === 'In Call' ? (
                <SuccessIcon decorative size="sizeIcon10" />
              ) : callStatus === 'Incoming' ? (
                <WarningIcon decorative size="sizeIcon10" />
              ) : (
                <ErrorIcon decorative size="sizeIcon10" />
              )}{' '}
              {t('call')}: {callStatus}
            </Badge>
          </Flex>
        </Flex>
        <Separator orientation="horizontal" verticalSpacing="space50" />
      </Box>

      {/* Controls Section */}
      <Box className={styles.controls}>
        <Stack orientation="vertical" spacing="space50">
          <Flex alignItems="center" columnGap="space50" style={{ flexWrap: 'wrap' }}>
            <Input
              placeholder={t('dialPlaceholder')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              size="default"
              style={{ flexGrow: 1 }}
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
          </Flex>
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
          <Stack orientation="vertical" spacing="space30">
            <HelpText variant="default">{isMuted ? t('micMuted') : t('micLive')}</HelpText>
            <HelpText variant="default">
              {t('hold')}: {holding ? t('yes') : t('no')}
            </HelpText>
            <HelpText variant="default">
              {t('recording')}: {recStatus}
            </HelpText>
          </Stack>
        </Stack>
      </Box>

      {/* Dialpad Section */}
      <Box className={styles.dialpad}>
        <Heading as="h4" variant="heading40" marginBottom="space50">
          {t('dtmfKeypad')}
        </Heading>
        <DialPad onDigit={sendDtmf} disabled={callStatus !== 'In Call'} />
      </Box>

      {/* Modals */}
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
