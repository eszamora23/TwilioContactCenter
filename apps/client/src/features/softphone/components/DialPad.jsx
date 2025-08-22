import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { useTranslation } from 'react-i18next';
import styles from './Softphone.module.css';

export default function DialPad({ onDigit, disabled }) {
  const { t } = useTranslation();
  const digits = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  return (
    <Box className={styles.padGrid}>
      {digits.map((d) => (
        <Button
          key={d}
          variant="secondary"
          className={styles.key}
          aria-label={`${t('dial')} ${d}`}
          title={`${t('dial')} ${d}`}
          onClick={() => onDigit(d)}
          disabled={disabled}
        >
          {d}
        </Button>
      ))}
    </Box>
  );
}
