// contact-center/client/src/components/StatusBar.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

import { Box } from '@twilio-paste/core/box';
import { Badge } from '@twilio-paste/core/badge';
import { Select, Option } from '@twilio-paste/core/select';
import { Stack } from '@twilio-paste/core/stack';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';

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
      padding="space60"
      backgroundColor="colorBackgroundBody"
      borderRadius="borderRadius30"
      boxShadow="shadow"
    >
      <Stack orientation={['vertical', 'horizontal']} spacing="space50" alignment="center">
        <Box>
          {t('agentStatus')}{' '}
          {loading ? (
            <SkeletonLoader />
          ) : (
            <Badge as="span" variant={isAvailable ? 'success' : 'neutral'}>
              {label || '—'}
            </Badge>
          )}
        </Box>

        <Select
          onChange={(e) => onChange?.(e.target.value)}
          defaultValue=""
          size="default"
          disabled={loading || !acts.length}
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
      </Stack>
    </Box>
  );
}
