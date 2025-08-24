// contact-center/client/src/features/tasks/components/StatusBar.jsx
import { useEffect, useState } from 'react';
import http from '../../../shared/services/http.js';
import { useTranslation } from 'react-i18next';

import { Box } from '@twilio-paste/core/box';
import { Badge } from '@twilio-paste/core/badge';
import { Select, Option } from '@twilio-paste/core/select';
import { Stack } from '@twilio-paste/core/stack';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Label } from '@twilio-paste/core/label';

export default function StatusBar({ label, onChange }) {
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    http
      .get('/taskrouter/activities')
      .then((r) => setActs(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const txt = String(label || '').toLowerCase();
  const variant =
    txt.includes('available') ? 'success' :
    txt.includes('offline')   ? 'error'   :
                                'neutral';

  return (
    <Box
      as="section"
      width="100%"
      // --- Anti-solape: sticky bajo el header del shell ---
      style={{
        position: 'sticky',
        top: 'var(--shell-header-h, 64px)',
        zIndex: 2,
        backdropFilter: 'saturate(140%) blur(6px)',
      }}
      backgroundColor="colorBackgroundBody"
      borderBottomColor="colorBorderWeak"
      borderBottomWidth="borderWidth10"
      borderBottomStyle="solid"
    >
      <Box paddingX="space70" paddingY="space60" backgroundColor="colorBackgroundBody">
        <Stack
          orientation={['vertical', 'horizontal']}
          spacing="space60"
          alignment="center"
          distribution="spaceBetween"
          style={{ flexWrap: 'wrap' }}
        >
          {/* Estado del agente */}
          <Box aria-live="polite" minWidth="0">
            {t('agentStatus')}{' '}
            {loading ? (
              <SkeletonLoader />
            ) : (
              <Badge as="span" variant={variant}>
                {label || '—'}
              </Badge>
            )}
          </Box>

          {/* Selector de actividad (tamaño consistente) */}
          <Stack orientation="horizontal" spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
            <Box>
              <Label htmlFor="activitySelect" margin="space0">
                {t('changeActivity')}
              </Label>
            </Box>
            {loading ? (
              <SkeletonLoader />
            ) : (
              <Select
                id="activitySelect"
                onChange={(e) => onChange?.(e.target.value)}
                defaultValue=""
                size="default"
                disabled={!acts.length}
                style={{ minWidth: 220, maxWidth: 320 }}
              >
                <Option value="" disabled>
                  {t('changeActivity')}
                </Option>
                {acts.map((a) => (
                  <Option key={a.sid} value={a.sid}>
                    {a.name}
                  </Option>
                ))}
              </Select>
            )}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
