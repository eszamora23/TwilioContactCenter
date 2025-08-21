// contact-center/client/src/components/AgentApp.jsx
import { useState, useEffect } from 'react';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { Toaster } from '@twilio-paste/core/toast';

import { setAuth } from '../services/index.js';
import { useWorker } from '../hooks/useWorker.js';
import StatusBar from './StatusBar.jsx';
import Softphone from './Softphone.jsx';
import Presence from './Presence.jsx';
import Customer360 from './Customer360.jsx';
import TasksPanel from './TasksPanel.jsx';
import Reservations from './Reservations.jsx';
import AgentDesktopShell from './AgentDesktopShell.jsx';
import ActivityQuickSwitch from './ActivityQuickSwitch.jsx';
import CallControlsModal from './CallControlsModal.jsx';
import CardSection from './CardSection.jsx';
import { getCallSid } from '../softphone/callSidStore.js';

export default function AgentApp() {
  const { activity, reservations, setAvailable } = useWorker();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasCall, setHasCall] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setHasCall(Boolean(getCallSid())), 800);
    return () => clearInterval(iv);
  }, []);

  const sections = [
    { id: 'softphone', label: 'Softphone', content: () => <Softphone /> },
    { id: 'presence', label: 'Presence', content: () => <Presence /> },
    { id: 'customer360', label: 'Customer 360', content: () => <Customer360 /> },
    { id: 'tasks', label: 'Tasks', content: () => <TasksPanel setAvailable={setAvailable} /> },
    {
      id: 'reservations',
      label: 'Reservations',
      content: () => <Reservations items={reservations} standalone />,
      view: () => <Reservations items={reservations} />,
    },
  ];

  async function logout() {
    setAuth(null);
    const offlineSid = 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // tu Activity SID "Offline"/Break
    await setAvailable(offlineSid);
    window.location.reload();
  }

  const headerActions = (
    <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
      <ActivityQuickSwitch
        label={activity || '—'}
        onChange={(sid) => setAvailable(sid)}
      />
      {hasCall && (
        <Button variant="primary" onClick={() => setControlsOpen(true)}>
          Call controls
        </Button>
      )}
      <Button variant="destructive" onClick={logout}>
        Logout
      </Button>
    </Stack>
  );

  return (
    <Box minHeight="100vh" width="100%">
      <Toaster />

      <CallControlsModal
        isOpen={controlsOpen}
        onDismiss={() => setControlsOpen(false)}
      />

      <AgentDesktopShell
        sections={sections}
        title="Agent Desktop"
        actions={headerActions}
      >
        <Box marginBottom="space70">
          <StatusBar label={activity || '…'} onChange={(sid) => setAvailable(sid)} />
        </Box>

        <Box>
          {sections.map(({ id, label, content, view }) => (
            <CardSection key={id} id={id} title={label}>
              {(view || content)()}
            </CardSection>
          ))}
        </Box>
      </AgentDesktopShell>
    </Box>
  );
}

