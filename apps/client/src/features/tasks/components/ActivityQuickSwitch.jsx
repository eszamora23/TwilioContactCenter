import { useEffect, useState, useId } from 'react';
import http from '../../../shared/services/http.js';
import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';
import { Select, Option } from '@twilio-paste/core/select';
import { ScreenReaderOnly } from '@twilio-paste/core/screen-reader-only';

/**
 * ActivityQuickSwitch — Mobile-first, inline-friendly
 * - Mantiene API (props: label, onChange)
 * - Compacto en desktop (inline), apilado y full-width en mobile
 * - Sin anchos fijos que causen overflow; usa widths responsivos
 * - Estado visible con Badge; select accesible con label oculto
 */
export default function ActivityQuickSwitch({ label, onChange }) {
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSid, setSelectedSid] = useState('');
  const selectId = typeof useId === 'function' ? useId() : 'activity-select';

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
    <Box width="100%">
      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space30"
        alignment={[ 'stretch', 'center' ]}
        style={{ flexWrap: 'wrap' }}
      >
        {/* Estado actual (trunca si es largo) */}
        <Box display="inline-flex" alignItems="center" columnGap="space30" maxWidth={['100%','auto']}>
          <Badge as="span" variant={isAvailable ? 'success' : 'neutral'}>
            <span style={{ display: 'inline-block', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentAct?.name || label || '—'}
            </span>
          </Badge>
        </Box>

        {/* Selector responsivo (full width en mobile) */}
        <Box flexGrow={[1, 0]} width={['100%','auto']}>
          <ScreenReaderOnly>
            <label htmlFor={selectId}>Change activity</label>
          </ScreenReaderOnly>
          <Select
            id={selectId}
            size="small"
            disabled={loading || !acts.length}
            value={selectedSid}
            onChange={(e) => {
              const sid = e.target.value;
              setSelectedSid(sid);
              onChange?.(sid);
            }}
            style={{ width: '100%' }}
          >
            <Option value="" disabled>{loading ? 'Loading…' : 'Change activity…'}</Option>
            {acts.map((a) => (
              <Option key={a.sid} value={a.sid}>{a.name}</Option>
            ))}
          </Select>
        </Box>
      </Stack>
    </Box>
  );
}
