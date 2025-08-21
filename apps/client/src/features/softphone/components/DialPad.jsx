import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { useTranslation } from 'react-i18next';

export default function DialPad({ onDigit, disabled }) {
  const { t } = useTranslation();
  const digits = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  return (
    <Box className="sf__padGrid">
      {digits.map((d) => (
        <Button
          key={d}
          variant="secondary"
          className="sf__key"
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
