import { Modal, ModalHeader, ModalHeading, ModalBody, ModalFooter } from '@twilio-paste/core/modal';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { useTranslation } from 'react-i18next';

export default function IncomingModal({ isOpen, onAccept, onReject, onDismiss }) {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} ariaLabel="incoming-call" size="default">
      <ModalHeader><ModalHeading>{t('incomingCall')}</ModalHeading></ModalHeader>
      <ModalBody>{t('acceptIncomingPrompt')}</ModalBody>
      <ModalFooter>
        <Stack orientation="horizontal" spacing="space40">
          <Button variant="secondary" onClick={onReject} aria-label={t('rejectAria')} title={t('rejectAria')}>
            {t('reject')}
          </Button>
          <Button variant="primary" onClick={onAccept} aria-label={t('acceptAria')} title={t('acceptAria')}>
            {t('accept')}
          </Button>
        </Stack>
      </ModalFooter>
    </Modal>
  );
}
