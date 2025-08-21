// contact-center/client/src/App.jsx
import { useState } from 'react';
import { IdleTimerProvider } from 'react-idle-timer';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from './i18n.js';
import { setAuth } from './api.js';
import Login from './components/Login.jsx';
import Softphone from './components/Softphone.jsx';
import StatusBar from './components/StatusBar.jsx';
import Reservations from './components/Reservations.jsx';
import { useWorker } from './taskrouter/useWorker.js';
import TasksPanel from './components/TasksPanel.jsx';
import Presence from './components/Presence.jsx';
import Customer360 from './components/Customer360.jsx';

import { Box } from '@twilio-paste/core/box';
import { Heading } from '@twilio-paste/core/heading';
import { Button } from '@twilio-paste/core/button';
import { Toaster } from '@twilio-paste/core/toast';
import { Stack } from '@twilio-paste/core/stack';
import DashboardLayout from './components/DashboardLayout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

function AgentApp() {
  const { worker, activity, reservations, setAvailable } = useWorker();

  async function logout() {
    setAuth(null);
    // Cambia por tu Activity SID "offline" real
    const offlineSid = 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    await setAvailable(offlineSid);
    window.location.reload();
  }

  return (
    <Box display="flex" flexDirection="column" minHeight="size100vh">
      <Toaster />
      <Stack
        orientation={['vertical', 'horizontal']}
        justifyContent="space-between"
        alignment="center"
        spacing="space40"
        marginBottom="space60"
      >
        <Heading as="h2" variant="heading20">
          Agent Desktop
        </Heading>
        <Button variant="destructive" onClick={logout}>
          Logout
        </Button>
      </Stack>

      <StatusBar label={activity || '…'} onChange={(sid) => setAvailable(sid)} />

      <Box marginTop="space70" flex="1" overflowY="auto">
        <ErrorBoundary>
          <DashboardLayout
            sections={[
              { id: 'softphone', label: 'Softphone', content: <Softphone /> },
              { id: 'customer360', label: 'Customer360', content: <Customer360 /> },
              {
                id: 'tasks',
                label: 'Tasks',
                content: <TasksPanel setAvailable={setAvailable} />,
              },
              { id: 'presence', label: 'Presence', content: <Presence /> },
              {
                id: 'reservations',
                label: 'Reservations',
                content: <Reservations items={reservations} />,
              },
            ]}
          />
        </ErrorBoundary>
      </Box>
    </Box>
  );
}

// Crea un QueryClient para toda la app (necesario para useQuery)
const queryClient = new QueryClient();

export default function App() {
  const [ctx, setCtx] = useState(null);

  if (!ctx) return <Login onReady={setCtx} />;

  const onIdle = () => {
    // Logout por inactividad
    setAuth(null);
    window.location.reload();
  };

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <IdleTimerProvider timeout={15 * 60 * 1000} onIdle={onIdle}>
          <AgentApp />
        </IdleTimerProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
