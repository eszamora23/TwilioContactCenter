import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Badge } from '@twilio-paste/core/badge';
import { Button } from '@twilio-paste/core/button';
import { Input } from '@twilio-paste/core/input';
import { Separator } from '@twilio-paste/core/separator';
import { Table, THead, TBody, Tr, Th, Td } from '@twilio-paste/core/table';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
export default function Reservations({ items = [], standalone = false, loading = false, onRefresh }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  const count = items?.length || 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? items
      : items.filter((r) => {
          const sid = String(r.sid || '').toLowerCase();
          const taskSid = String(r.task?.sid || '').toLowerCase();
          const st = String(r.reservationStatus || r.status || '').toLowerCase();
          return sid.includes(q) || taskSid.includes(q) || st.includes(q);
        });

    const sorted = [...base].sort((a, b) => {
      if (sortKey === 'status') {
        const sa = String(a.reservationStatus || a.status || '').toLowerCase();
        const sb = String(b.reservationStatus || b.status || '').toLowerCase();
        return sa.localeCompare(sb) * (sortAsc ? 1 : -1);
      } else {
        const da = a.dateCreated ? new Date(a.dateCreated).getTime() : 0;
        const db = b.dateCreated ? new Date(b.dateCreated).getTime() : 0;
        return (da - db) * (sortAsc ? 1 : -1);
      }
    });

    return sorted;
  }, [items, query, sortKey, sortAsc]);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function statusVariant(v) {
    const s = String(v || '').toLowerCase();
    if (['accepted', 'assigned', 'reserved'].includes(s)) return 'new';
    if (['wrapping'].includes(s)) return 'warning';
    if (['completed'].includes(s)) return 'success';
    if (['timeout', 'rejected', 'canceled', 'rescinded', 'failed'].includes(s)) return 'error';
    return 'neutral';
  }

  const CardShell = ({ children }) =>
    standalone ? (
      <Box
        backgroundColor="colorBackground"
        borderRadius="borderRadius30"
        boxShadow="shadow"
        padding="space70"
        display="flex"
        flexDirection="column"
        height="100%"
        minHeight="0"
      >
        {children}
      </Box>
    ) : (
      <>{children}</>
    );

  return (
    <CardShell>
      <style>{`
        .resv__body { flex: 1; min-height: 0; overflow: auto; }
        .resv__truncate {
          max-width: 260px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .resv__th--click { cursor: pointer; }
        .resv__sid { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
      `}</style>

      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        alignment="center"
        distribution="spaceBetween"
        style={{ flexWrap: 'wrap' }}
      >
        <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Heading as="h3" variant="heading30" margin="space0">
            {t('reservations')}
          </Heading>
          <Badge as="span" variant="neutral">
            {count}
          </Badge>
        </Stack>

        <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filterAgentsPlaceholder')}
            aria-label={t('filterAgentsAria')}
          />
          {typeof onRefresh === 'function' ? (
            <Button variant="secondary" onClick={onRefresh} disabled={loading}>
              {loading ? t('loading') : t('refresh')}
            </Button>
          ) : null}
        </Stack>
      </Stack>

      <Separator orientation="horizontal" verticalSpacing="space50" />

      <Box className="resv__body">
        {loading ? (
          <SkeletonLoader />
        ) : !filtered.length ? (
          <Box color="colorTextWeak">{t('noReservations')}</Box>
        ) : (
          <Table scrollHorizontally>
            <THead>
              <Tr>
                <Th scope="col">{t('reservationSid')}</Th>
                <Th scope="col">{t('taskSid')}</Th>
                <Th
                  scope="col"
                  className="resv__th--click"
                  onClick={() => toggleSort('status')}
                  aria-sort={sortKey === 'status' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  {t('status')} {sortKey === 'status' ? (sortAsc ? '↑' : '↓') : ''}
                </Th>
                <Th
                  scope="col"
                  className="resv__th--click"
                  onClick={() => toggleSort('date')}
                  aria-sort={sortKey === 'date' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  Date {sortKey === 'date' ? (sortAsc ? '↑' : '↓') : ''}
                </Th>
              </Tr>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const status = r.reservationStatus || r.status || '—';
                const date =
                  r.dateCreated
                    ? new Date(r.dateCreated).toLocaleString()
                    : '—';
                return (
                  <Tr key={r.sid}>
                    <Td className="resv__truncate resv__sid" title={r.sid}>
                      {r.sid}
                    </Td>
                    <Td className="resv__truncate resv__sid" title={r.task?.sid || '—'}>
                      {r.task?.sid || '—'}
                    </Td>
                    <Td>
                      <Badge as="span" variant={statusVariant(status)}>
                        {status}
                      </Badge>
                    </Td>
                    <Td className="resv__truncate" title={date}>
                      {date}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Box>
    </CardShell>
  );
}
