import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Select, Option } from '@twilio-paste/core/select';
import { Label } from '@twilio-paste/core/label';
import { Badge } from '@twilio-paste/core/badge';
import { Button } from '@twilio-paste/core/button';
import { Separator } from '@twilio-paste/core/separator';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Alert } from '@twilio-paste/core/alert';

export default function ActivitySwitcher({
  worker,
  activityLabel = '',
  id = 'activity-switcher',
}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const apiBase =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
    'http://localhost:4000/api';

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr('');
    axios
      .get(`${apiBase}/taskrouter/activities`)
      .then((r) => {
        if (!mounted) return;
        setActivities(r.data || []);
      })
      .catch(() => {
        if (!mounted) return;
        setErr('Failed to load activities');
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [apiBase]);

  async function onChange(e) {
    const sid = e.target.value;
    if (!sid || !worker) return;
    try {
      await worker.update({ ActivitySid: sid });
    } catch {
      setErr('Could not change activity');
    }
  }

  const isDisabled = useMemo(
    () => !worker || loading || !activities.length,
    [worker, loading, activities]
  );

  const isAvailable = String(activityLabel).toLowerCase().includes('available');

  return (
    <Box
      id={id}
      role="region"
      aria-label="Activity switcher"
      width="100%"
      minWidth="0"
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
      style={{ position: 'relative', zIndex: 1 }}
    >
      {/* Header */}
      {err ? (
        <Box marginBottom="space50">
          <Alert variant="error">{err}</Alert>
        </Box>
      ) : null}

      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        distribution="spaceBetween"
        alignment="center"
        style={{ flexWrap: 'wrap' }}
      >
        <Stack orientation="vertical" spacing="space20">
          <Heading as="h4" variant="heading40" margin="space0">
            Agent Activity
          </Heading>
          <Box color="colorTextWeak" fontSize="fontSize30">
            Switch your TaskRouter status
          </Box>
        </Stack>

        <Badge as="span" variant={isAvailable ? 'success' : 'neutral'}>
          {activityLabel || '—'}
        </Badge>
      </Stack>

      <Separator orientation="horizontal" verticalSpacing="space50" />

      {/* Body */}
      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space60"
        alignment="center"
        style={{ flexWrap: 'wrap' }}
      >
        <Box minWidth="220px">
          <Label htmlFor="activitySwitcherSelect">Select new activity</Label>
          {loading ? (
            <SkeletonLoader />
          ) : (
            <Select
              id="activitySwitcherSelect"
              onChange={onChange}
              disabled={isDisabled}
              defaultValue=""
              size="default"
            >
              <Option value="" disabled>
                Change activity…
              </Option>
              {activities.map((a) => (
                <Option key={a.sid} value={a.sid}>
                  {a.name}
                </Option>
              ))}
            </Select>
          )}
        </Box>

        <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
            disabled={loading}
          >
            Refresh list
          </Button>
          <Button
            variant="secondary"
            onClick={() => onChange({ target: { value: '' } })}
            disabled
            title="Quick set (demo – disabled)"
          >
            Quick set
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
