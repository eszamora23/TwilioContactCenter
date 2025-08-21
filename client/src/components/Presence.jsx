// contact-center/client/src/components/Presence.jsx
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { presence } from '../services/taskRouter.js';

import { Box } from '@twilio-paste/core/box';
import { Heading } from '@twilio-paste/core/heading';
import { Table, THead, TBody, Tr, Th, Td } from '@twilio-paste/core/table';
import { Badge } from '@twilio-paste/core/badge';
import { Button } from '@twilio-paste/core/button';
import { Stack } from '@twilio-paste/core/stack';
import { Alert } from '@twilio-paste/core/alert';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { UserIcon } from '@twilio-paste/icons/esm/UserIcon';
import { Input } from '@twilio-paste/core/input';
import { Modal, ModalHeader, ModalHeading, ModalBody, ModalFooter } from '@twilio-paste/core/modal';

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const socketBase = import.meta.env.VITE_SOCKET_BASE || new URL(baseURL).origin;

/**
 * Presence (Refined UI)
 * - Card compacto que NO rompe el layout de la grilla.
 * - Chips de agentes (hasta 8) para vista rápida.
 * - Botón “Open roster” abre un modal con tabla completa (scrollable).
 * - Mantiene toda la lógica original de datos / callbacks.
 */
export default function Presence({ onTransferClick, onWhisperClick }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [open, setOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['presence'],
    queryFn: async () => {
      try {
        setError('');
        return await presence();
      } catch (e) {
        console.error(e);
        setError(t('presenceLoadError'));
        throw e;
      }
    },
    staleTime: 10000,
    refetchInterval: 5000,
    keepPreviousData: true,
  });

  useEffect(() => {
    const socket = io(socketBase, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: false,
    });

    socket.on('presence_update', ({ data }) => {
      if (data) queryClient.setQueryData(['presence'], data);
      else queryClient.invalidateQueries(['presence']);
    });
    socket.on('connect_error', (err) => {
      console.warn('[socket.io] connect_error:', err?.message || err);
    });

    return () => socket.disconnect();
  }, [queryClient]);

  /* ======== Filtros & Orden ======== */
  const filteredRows = useMemo(() => {
    const lower = filter.toLowerCase();
    let data = rows.filter(
      (r) =>
        (!availableOnly || r.available) &&
        (r.friendlyName.toLowerCase().includes(lower) ||
          r.activityName.toLowerCase().includes(lower))
    );
    if (sortKey === 'activity') {
      data = data.slice().sort((a, b) =>
        a.activityName.localeCompare(b.activityName) * (sortAsc ? 1 : -1)
      );
    } else if (sortKey === 'available') {
      data = data
        .slice()
        .sort(
          (a, b) =>
            (a.available === b.available ? 0 : a.available ? 1 : -1) *
            (sortAsc ? 1 : -1)
        );
    } else {
      // orden por defecto: disponibles primero, luego por nombre
      data = data
        .slice()
        .sort((a, b) => {
          if (a.available === b.available) {
            return a.friendlyName.localeCompare(b.friendlyName);
          }
          return a.available ? -1 : 1;
        });
    }
    return data;
  }, [rows, filter, availableOnly, sortKey, sortAsc]);

  const topChips = filteredRows.slice(0, 8);
  const availableCount = rows?.filter?.((r) => r.available)?.length || 0;

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
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
      <style>{`
        .presence__chips{
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: var(--paste-space-50);
        }
        .presence__chip{
          background: var(--paste-color-background-body);
          border-radius: var(--paste-border-radius-20);
          padding: var(--paste-space-50);
          display: flex;
          flex-direction: column;
          gap: var(--paste-space-30);
          min-width: 0;
          min-height: 120px;
        }
        .presence__chipRow{
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--paste-space-40);
          min-width: 0;
        }
        .presence__chipName{
          font-weight: var(--paste-font-weight-semibold);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .presence__toolbar{
          gap: var(--paste-space-40);
          flex-wrap: wrap;
        }
        .presence__modalTable{
          max-height: 60vh; overflow:auto;
        }
      `}</style>

      {/* Header compacto */}
      {error && (
        <Box marginBottom="space50">
          <Alert variant="error">{error}</Alert>
        </Box>
      )}

      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        distribution="spaceBetween"
        alignment="center"
        style={{ flexWrap: 'wrap' }}
      >
        <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Heading as="h3" variant="heading30" margin="space0">
            {t('presence')}
          </Heading>
          <Badge as="span" variant="new">
            {availableCount} {t('available')}
          </Badge>
        </Stack>

        {/* Toolbar */}
        <Stack orientation="horizontal" className="presence__toolbar">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('filterAgentsPlaceholder')}
            aria-label={t('filterAgentsAria')}
          />
          <Button
            variant={availableOnly ? 'primary' : 'secondary'}
            onClick={() => setAvailableOnly((v) => !v)}
          >
            {t('available')}
          </Button>
          <Button
            aria-label={t('refreshAria')}
            onClick={() => queryClient.refetchQueries(['presence'])}
            disabled={loading}
            variant="secondary"
          >
            {loading ? t('loading') : t('refresh')}
          </Button>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Open roster
          </Button>
        </Stack>
      </Stack>

      {/* Chips (vista rápida) */}
      <Box marginTop="space60" flexGrow={1} minHeight="0" overflow="auto">
        {loading ? (
          <SkeletonLoader />
        ) : !filteredRows.length ? (
          <Box color="colorTextWeak">{t('noAgents')}</Box>
        ) : (
          <Box className="presence__chips">
            {topChips.map((r) => (
              <Box key={r.workerSid} className="presence__chip">
                <Box className="presence__chipRow">
                  <Box className="presence__chipName" title={r.friendlyName}>
                    <UserIcon decorative /> {r.friendlyName}
                  </Box>
                  <Badge as="span" variant={r.available ? 'success' : 'neutral'}>
                    {r.available ? t('yes') : t('no')}
                  </Badge>
                </Box>

                <Box className="presence__chipRow">
                  <Box color="colorTextWeak" fontSize="fontSize30" title={r.activityName}>
                    {t('activity')}: <b>{r.activityName}</b>
                  </Box>
                </Box>

                <Box className="presence__chipRow">
                  <Box color="colorTextWeak" fontSize="fontSize30" title={r.contactUri || '—'}>
                    {t('contactUri')}: <b>{r.contactUri || '—'}</b>
                  </Box>
                </Box>

                <Stack orientation="horizontal" spacing="space40">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => onTransferClick?.(r)}
                  >
                    {t('transferTo')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => onWhisperClick?.(r)}
                  >
                    {t('whisperTo')}
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Modal con tabla completa (no rompe el layout del card) */}
      <Modal isOpen={open} onDismiss={() => setOpen(false)} size="wide">
        <ModalHeader>
          <ModalHeading>{t('presence')}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('filterAgentsPlaceholder')}
              aria-label={t('filterAgentsAria')}
            />
            <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
              <Button
                variant={sortKey === 'activity' ? 'primary' : 'secondary'}
                onClick={() => handleSort('activity')}
              >
                {t('activity')}
              </Button>
              <Button
                variant={sortKey === 'available' ? 'primary' : 'secondary'}
                onClick={() => handleSort('available')}
              >
                {t('available')}
              </Button>
              <Button variant="secondary" onClick={() => { setSortKey(null); setSortAsc(true); }}>
                Reset
              </Button>
            </Stack>
          </Stack>

          <Box className="presence__modalTable" marginTop="space60">
            {loading ? (
              <SkeletonLoader />
            ) : !filteredRows.length ? (
              <Box color="colorTextWeak">{t('noAgents')}</Box>
            ) : (
              <Table scrollHorizontally>
                <THead>
                  <Tr>
                    <Th scope="col">{t('agent')}</Th>
                    <Th scope="col">{t('activity')}</Th>
                    <Th scope="col">{t('available')}</Th>
                    <Th scope="col">{t('contactUri')}</Th>
                    <Th scope="col">{t('actions')}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {filteredRows.map((r) => (
                    <Tr role="row" key={r.workerSid}>
                      <Td title={r.friendlyName}>
                        <UserIcon decorative /> {r.friendlyName}
                      </Td>
                      <Td title={r.activityName}>{r.activityName}</Td>
                      <Td>
                        <Badge as="span" variant={r.available ? 'success' : 'neutral'}>
                          {r.available ? t('yes') : t('no')}
                        </Badge>
                      </Td>
                      <Td title={r.contactUri || '—'}>{r.contactUri || '—'}</Td>
                      <Td>
                        <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => onTransferClick?.(r)}
                          >
                            {t('transferTo')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => onWhisperClick?.(r)}
                          >
                            {t('whisperTo')}
                          </Button>
                        </Stack>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => setOpen(false)}>Close</Button>
        </ModalFooter>
      </Modal>
    </Box>
  );
}
