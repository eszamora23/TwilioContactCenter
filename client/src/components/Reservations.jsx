// contact-center/client/src/components/Reservations.jsx
import { Heading } from '@twilio-paste/core/heading';
import { Table, THead, TBody, Tr, Th, Td } from '@twilio-paste/core/table';
import { Box } from '@twilio-paste/core/box';
import { useTranslation } from 'react-i18next';

export default function Reservations({ items }) {
  const { t } = useTranslation();
  return (
    <Box padding="space60" backgroundColor="colorBackground" borderRadius="borderRadius30" boxShadow="shadow">
      <Heading as="h3" variant="heading30" marginBottom="space50">
        {t('reservations')}
      </Heading>
      {items?.length ? (
        <Table scrollHorizontally>
          <THead>
            <Tr>
              <Th>{t('reservationSid')}</Th>
              <Th>{t('taskSid')}</Th>
              <Th>{t('status')}</Th>
            </Tr>
          </THead>
          <TBody>
            {items.map((r) => (
              <Tr key={r.sid}>
                <Td>{r.sid}</Td>
                <Td>{r.task?.sid || '—'}</Td>
                <Td>{r.reservationStatus || r.status || '—'}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <Box color="colorTextWeak">{t('noReservations')}</Box>
      )}
    </Box>
  );
}
