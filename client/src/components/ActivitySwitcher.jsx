// contact-center/client/src/components/ActivitySwitcher.jsx
import { useEffect, useState } from 'react';
import { Select, Option } from '@twilio-paste/core/select';
import { Stack } from '@twilio-paste/core/stack';
import axios from 'axios';

export default function ActivitySwitcher({ worker, activityLabel }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('http://localhost:4000/api/taskrouter/activities')
      .then(r => setActivities(r.data))
      .finally(() => setLoading(false));
  }, []);

  async function onChange(e) {
    const sid = e.target.value;
    if (!sid || !worker) return;
    await worker.update({ ActivitySid: sid });
  }

  return (
    <Stack orientation={['vertical', 'horizontal']} spacing="space50">
      <div>Activity: <b>{activityLabel || '...'}</b></div>
      <Select onChange={onChange} disabled={!worker || loading} defaultValue="">
        <Option value="" disabled>Change activity…</Option>
        {activities.map(a => (
          <Option key={a.sid} value={a.sid}>{a.name}</Option>
        ))}
      </Select>
    </Stack>
  );
}
