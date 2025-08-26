import { useEffect, useState } from 'react';
import http from '../../../shared/services/http.js';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';
import { Select, Option } from '@twilio-paste/core/select';

export default function ActivityQuickSwitch({ label, onChange }) {
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSid, setSelectedSid] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await http.get('/taskrouter/activities');
        if (mounted) setActs(r.data || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Keep <Select> in sync with the Worker’s activity name coming in via `label`
  useEffect(() => {
    if (!acts.length) { setSelectedSid(''); return; }
    const match = acts.find(
      (a) => String(a.name).toLowerCase() === String(label || '').toLowerCase()
    );
    setSelectedSid(match?.sid || '');
  }, [acts, label]);

  const currentAct = acts.find((a) => a.sid === selectedSid);
  const isAvailable = currentAct
    ? /available/i.test(currentAct.name)
    : /available/i.test(String(label || ''));

  return (
    <Stack
      orientation="horizontal"
      spacing="space40"
      alignment="center"
      style={{ flexWrap: 'wrap' }}
    >
      <Badge as="span" variant={isAvailable ? 'success' : 'neutral'}>
        {currentAct?.name || label || '—'}
      </Badge>

      <Select
        size="small"
        disabled={loading || !acts.length}
        value={selectedSid}
        onChange={(e) => {
          const sid = e.target.value;
          setSelectedSid(sid);
          onChange?.(sid);
        }}
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
