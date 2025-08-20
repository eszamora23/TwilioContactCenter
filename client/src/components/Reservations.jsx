// contact-center/client/src/components/Reservations.jsx
import { Heading } from '@twilio-paste/core/heading';
import { Table, THead, TBody, Tr, Th, Td } from '@twilio-paste/core/table';
import { Box } from '@twilio-paste/core/box';

export default function Reservations({ items }) {
  return (
    <Box padding="space60" backgroundColor="colorBackground" borderRadius="borderRadius30" boxShadow="shadow">
      <Heading as="h3" variant="heading30" marginBottom="space50">
        Reservations
      </Heading>
      {items?.length ? (
        <Table scrollHorizontally>
          <THead>
            <Tr>
              <Th>Reservation SID</Th>
              <Th>Task SID</Th>
              <Th>Status</Th>
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
        <Box color="colorTextWeak">No reservations</Box>
      )}
    </Box>
  );
}
