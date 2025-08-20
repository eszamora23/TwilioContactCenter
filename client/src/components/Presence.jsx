// contact-center/client/src/components/Presence.jsx
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import Api from '../api.js';
import { Box } from '@twilio-paste/core/box';
import { Heading } from '@twilio-paste/core/heading';
import { Table, THead, TBody, Tr, Th, Td } from '@twilio-paste/core/table';
import { Badge } from '@twilio-paste/core/badge';
import { Button } from '@twilio-paste/core/button';
import { Stack } from '@twilio-paste/core/stack';
import { Alert } from '@twilio-paste/core/alert';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { UserIcon } from '@twilio-paste/icons/esm/UserIcon';

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function Presence({ onTransferClick, onWhisperClick }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['presence'],
    queryFn: async () => {
      try {
        setError('');
        return await Api.presence();
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
    // fuerza websocket y habilita reconexión suave
    const socket = io(baseURL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: false,
    });

    socket.on('presence_update', ({ data }) => {
      if (data) {
        queryClient.setQueryData(['presence'], data);
      } else {
        queryClient.invalidateQueries(['presence']);
      }
    });
    socket.on('connect_error', (err) => {
      // no rompas la UI si el socket falla; solo log
      console.warn('[socket.io] connect_error:', err?.message || err);
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  if (loading) return <SkeletonLoader />;

  return (
    <Box padding="space60" backgroundColor="colorBackground" borderRadius="borderRadius30" boxShadow="shadow">
      {error && <Alert variant="error">{error}</Alert>}
      <Stack orientation={['vertical', 'horizontal']} spacing="space40" distribution="spaceBetween" alignment="center">
        <Heading as="h3" variant="heading30" margin="space0">{t('presence')}</Heading>
        <Button aria-label={t('refreshAria')} onClick={() => queryClient.refetchQueries(['presence'])} disabled={loading} variant="secondary">
          {loading ? t('loading') : t('refresh')}
        </Button>
      </Stack>

      {!rows.length ? (
        <Box color="colorTextWeak" marginTop="space50">{t('noAgents')}</Box>
      ) : (
        <Table scrollHorizontally marginTop="space50">
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
            {rows.map((r) => (
              <Tr role="row" key={r.workerSid}>
                <Td><UserIcon decorative /> {r.friendlyName}</Td>
                <Td>{r.activityName}</Td>
                <Td>
                  <Badge as="span" variant={r.available ? 'success' : 'neutral'}>
                    {r.available ? t('yes') : t('no')}
                  </Badge>
                </Td>
                <Td>{r.contactUri || '—'}</Td>
                <Td>
                  <Stack orientation="horizontal" spacing="space30">
                    <Button variant="secondary" size="small" onClick={() => onTransferClick?.(r)}>
                      {t('transferTo')}
                    </Button>
                    <Button variant="secondary" size="small" onClick={() => onWhisperClick?.(r)}>
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
  );
}