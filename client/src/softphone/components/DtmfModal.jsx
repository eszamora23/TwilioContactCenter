import { Modal, ModalHeader, ModalHeading, ModalBody, ModalFooter } from '@twilio-paste/core/modal';
import { Button } from '@twilio-paste/core/button';
import { useTranslation } from 'react-i18next';
import DialPad from './DialPad.jsx';

export default function DtmfModal({ isOpen, onDismiss, onDigit, disabled }) {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} ariaLabel="dtmf-keypad" size="default">
      <ModalHeader><ModalHeading>{t('dtmfKeypad')}</ModalHeading></ModalHeader>
      <ModalBody>
        <DialPad disabled={disabled} onDigit={onDigit} />
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onDismiss} aria-label={t('close')} title={t('close')}>
          {t('close')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
