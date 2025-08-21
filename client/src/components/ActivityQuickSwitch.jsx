import { useEffect, useState } from 'react';
import http from '../services/http.js';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';
import { Select, Option } from '@twilio-paste/core/select';

export default function ActivityQuickSwitch({ label, onChange }) {
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    http
      .get('/taskrouter/activities')
      .then((r) => {
        if (mounted) setActs(r.data || []);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const isAvailable = String(label || '').toLowerCase().includes('available');

  return (
    <Stack orientation="horizontal" spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
      <Badge as="span" variant={isAvailable ? 'success' : 'neutral'}>
        {label || '—'}
      </Badge>
      <Select
        size="small"
        disabled={loading || !acts.length}
        onChange={(e) => onChange?.(e.target.value)}
        defaultValue=""
        style={{ minWidth: 180 }}
      >
        <Option value="" disabled>Change activity…</Option>
        {acts.map((a) => (
          <Option key={a.sid} value={a.sid}>{a.name}</Option>
        ))}
      </Select>
    </Stack>
  );
}
