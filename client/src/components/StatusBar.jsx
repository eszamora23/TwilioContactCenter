// contact-center/client/src/components/StatusBar.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
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
    const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
    axios
      .get(`${base}/taskrouter/activities`)
      .then((r) => setActs(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const isAvailable = String(label || '').toLowerCase().includes('available');

  return (
    <Box
      as="section"
      width="100%"
      // --- Anti-solape: sticky bajo el header del shell ---
      style={{
        position: 'sticky',
        top: 'var(--shell-header-h, 64px)', // ajustable desde el shell si cambias la altura del header
        zIndex: 2,
        backdropFilter: 'saturate(140%) blur(6px)',
      }}
      backgroundColor="colorBackgroundBody"
      borderBottomColor="colorBorderWeak"
      borderBottomWidth="borderWidth10"
      borderBottomStyle="solid"
    >
      <Box
        paddingX="space70"
        paddingY="space60"
        backgroundColor="colorBackgroundBody"
      >
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
              <Badge as="span" variant={isAvailable ? 'success' : 'neutral'}>
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
                // ancho consistente para que no “salte” el layout
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
