import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';
import { Button } from '@twilio-paste/core/button';
import { Separator } from '@twilio-paste/core/separator';
import {
  Modal,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from '@twilio-paste/core/modal';
import Api from '../../index.js';
import { getCallSid } from '../services/callSidStore.js';
import { SOFTPHONE_POPUP_FEATURES } from '../constants.js';
import CallControlBar from './CallControlBar.jsx';
import useCallControls from './useCallControls.js';

export default function CallControlsModal({ isOpen, onDismiss }) {
  const { t } = useTranslation();
  const [agentCallSid, setAgentCallSid] = useState(null);
  const [customerCallSid, setCustomerCallSid] = useState(null);
  const [taskSid, setTaskSid] = useState(null);

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
  } = useCallControls();

  useEffect(() => {
    if (!isOpen) return;
    const sid = getCallSid();
    setAgentCallSid(sid || null);

    (async () => {
      try {
        const list = await Api.myTasks('assigned,reserved,wrapping');
        const picked =
          list.find((t) => t?.attributes?.callSid || t?.attributes?.call_sid) ||
          list[0] ||
          null;

        setCustomerCallSid(
          picked?.attributes?.callSid || picked?.attributes?.call_sid || null,
        );
        setTaskSid(picked?.sid || null);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [isOpen]);

  const openSoftphonePopout = () => {
    window.open(
      `${window.location.origin}?popup=softphone`,
      'softphone_popup',
      SOFTPHONE_POPUP_FEATURES,
    );
  };

  const doHoldStart = async () => {
    if (!agentCallSid || !customerCallSid) return;
    // Use the hook method so local "holding" state stays in sync, but pass correct targets
    await holdStart({
      taskSid,
      agentCallSid,
      customerCallSid,
      who: 'customer',
    });
  };

  const doHoldStop = async () => {
    if (!agentCallSid || !customerCallSid) return;
    await holdStop({
      taskSid,
      agentCallSid,
      customerCallSid,
      who: 'customer',
    });
  };

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} size="default">
      <ModalHeader>
        <ModalHeading>{t('callControls')}</ModalHeading>
      </ModalHeader>
      <ModalBody>
        <Stack orientation="vertical" spacing="space70">
          {/* Estado */}
          <Box>
            <Stack
              orientation="horizontal"
              spacing="space50"
              alignment="center"
              style={{ flexWrap: 'wrap' }}
            >
              <Badge
                as="span"
                variant={
                  recStatus === 'in-progress'
                    ? 'new'
                    : recStatus === 'paused'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {t('recording')}: {recStatus}
              </Badge>
              {agentCallSid ? (
                <Badge as="span" variant="success">
                  {t('agentCall')}: {agentCallSid}
                </Badge>
              ) : (
                <Badge as="span" variant="neutral">{t('noActiveCallTitle')}</Badge>
              )}
              {customerCallSid ? (
                <Badge as="span" variant="neutral">
                  {t('customerCall')}: {customerCallSid}
                </Badge>
              ) : null}
              {taskSid ? (
                <Badge as="span" variant="neutral">
                  Task: {taskSid}
                </Badge>
              ) : null}
            </Stack>
          </Box>

          <Separator orientation="horizontal" />

          <CallControlBar
            callStatus={callStatus}
            isMuted={isMuted}
            holding={holding}
            recStatus={recStatus}
            hangup={() => {
              hangup();
              onDismiss?.();
            }}
            toggleMute={toggleMute}
            holdStart={doHoldStart}
            holdStop={doHoldStop}
            recStart={recStart}
            recPause={recPause}
            recResume={recResume}
            recStop={recStop}
            onOpenDtmf={() => {}}
          />

          <Separator orientation="horizontal" />

          <Button variant="secondary" onClick={openSoftphonePopout}>
            {t('openSoftphonePopout')}
          </Button>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onDismiss}>{t('close')}</Button>
      </ModalFooter>
    </Modal>
  );
}
