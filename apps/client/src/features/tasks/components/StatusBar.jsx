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

export default function StatusBar({ label, onChange, inline = false }) {
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  // NEW: track which SID is currently selected so the <Select> is controlled
  const [selectedSid, setSelectedSid] = useState('');

  useEffect(() => {
    http
      .get('/taskrouter/activities')
      .then((r) => setActs(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  // NEW: keep the select in sync with the Worker's current activity label
  useEffect(() => {
    const current = acts.find(
      (a) => a?.name?.toLowerCase() === String(label || '').toLowerCase()
    );
    setSelectedSid(current?.sid || '');
  }, [acts, label]);

  const txt = String(label || '').toLowerCase();
  const variant =
    txt.includes('available') ? 'success' :
    txt.includes('offline')   ? 'error'   :
                                'neutral';

  /* Inline compact variant for header */
  if (inline) {
    return (
      <Stack orientation="horizontal" spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
        <Badge as="span" variant={variant}>
          {label || '—'}
        </Badge>
        {loading ? (
          <SkeletonLoader />
        ) : (
          <Select
            value={selectedSid}
            onChange={(e) => {
              setSelectedSid(e.target.value);
              onChange?.(e.target.value);
            }}
            size="small"
            disabled={!acts.length}
            style={{ minWidth: 200 }}
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
    );
  }

  /* Default sticky bar */
  return (
    <Box
      as="section"
      width="100%"
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
                value={selectedSid}
                onChange={(e) => {
                  setSelectedSid(e.target.value);
                  onChange?.(e.target.value);
                }}
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
