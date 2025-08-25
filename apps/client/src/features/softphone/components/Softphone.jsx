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

/**
 * Siempre montamos el hook para que el Device exista en la ventana principal.
 * Si popupOpen === true (y no es remoteOnly), ocultamos la UI inline
 * pero mantenemos el estado y el canal para el popup.
 */
export default function Softphone({ remoteOnly = false, popupOpen = false }) {
  return <SoftphoneInner remoteOnly={remoteOnly} hiddenInline={!remoteOnly && popupOpen} />;
}

function SoftphoneInner({ remoteOnly, hiddenInline }) {
  const isPopup = remoteOnly === true; // diseño full-height dentro del popup
  const { t } = useTranslation();

  // Hook SIEMPRE montado en main; en popup (remoteOnly) no crea Device
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

  // Si aún no está listo, mostramos skeleton (sólo cuando debería verse UI)
  if (!ready && !hiddenInline) return <SkeletonLoader />;

  // Si UI inline está oculta porque el popup está ON, no renderizamos UI,
  // pero el hook ya quedó montado y el Device activo en esta ventana.
  if (hiddenInline) return null;

  return (
    <Box
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
      className={styles.layout}
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
