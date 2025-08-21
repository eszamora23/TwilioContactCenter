// contact-center/client/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { IdleTimerProvider } from 'react-idle-timer';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from './i18n.js';
import { setAuth } from './services/index.js';
import Login from './components/Login.jsx';

import StatusBar from './components/StatusBar.jsx';
import Softphone from './components/Softphone.jsx';
import Presence from './components/Presence.jsx';
import Customer360 from './components/Customer360.jsx';
import TasksPanel from './components/TasksPanel.jsx';
import Reservations from './components/Reservations.jsx';

import { useWorker } from './hooks/useWorker.js';
import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { Toaster } from '@twilio-paste/core/toast';
import AgentDesktopShell from './components/AgentDesktopShell.jsx';
import ActivityQuickSwitch from './components/ActivityQuickSwitch.jsx';
import CallControlsModal from './components/CallControlsModal.jsx';
import { getCallSid } from './softphone/callSidStore.js';

// Tarjeta simple reutilizable para “Secciones” (vista principal)
function CardSection({ id, title, children }) {
  return (
    <Box id={id} marginBottom="space70">
      <Box
        backgroundColor="colorBackground"
        borderRadius="borderRadius30"
        boxShadow="shadow"
        padding="space70"
      >
        <Box as="h4" margin="space0" fontSize="fontSize40" fontWeight="fontWeightSemibold">
          {title}
        </Box>
        <Box marginTop="space60">{children}</Box>
      </Box>
    </Box>
  );
}

function AgentApp() {
  const { activity, reservations, setAvailable } = useWorker();
  const scrollRootRef = useRef(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasCall, setHasCall] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setHasCall(Boolean(getCallSid())), 800);
    return () => clearInterval(iv);
  }, []);

  // Secciones con soporte de popup interno (modal) desde el sidebar
  const sections = [
    { id: 'softphone',    label: 'Softphone',     content: () => <Softphone /> },
    { id: 'presence',     label: 'Presence',      content: () => <Presence /> },
    { id: 'customer360',  label: 'Customer 360',  content: () => <Customer360 /> },
    { id: 'tasks',        label: 'Tasks',         content: () => <TasksPanel setAvailable={setAvailable} /> },
    { id: 'reservations', label: 'Reservations',  content: () => <Reservations items={reservations} standalone /> },
  ];

  async function logout() {
    setAuth(null);
    const offlineSid = 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // tu Activity SID "Offline"/Break
    await setAvailable(offlineSid);
    window.location.reload();
  }

  // Acciones del header del shell (derecha)
  const headerActions = (
    <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
      {/* Agent status inline (cambia Activity) */}
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

      {/* Modal de controles de llamada (hermano del shell) */}
      <CallControlsModal
        isOpen={controlsOpen}
        onDismiss={() => setControlsOpen(false)}
      />

      <AgentDesktopShell
        sections={sections}
        title="Agent Desktop"
        actions={headerActions}
      >
        {/* StatusBar bajo el header del shell */}
        <Box marginBottom="space70">
          <StatusBar label={activity || '…'} onChange={(sid) => setAvailable(sid)} />
        </Box>

        {/* Vista principal: SOLO “Secciones” apiladas */}
        <Box ref={scrollRootRef}>
          <CardSection id="softphone" title="Softphone">
            <Softphone />
          </CardSection>

          <CardSection id="presence" title="Presence">
            <Presence />
          </CardSection>

          <CardSection id="customer360" title="Customer 360">
            <Customer360 />
          </CardSection>

          <CardSection id="tasks" title="Tasks">
            <TasksPanel setAvailable={setAvailable} />
          </CardSection>

          <CardSection id="reservations" title="Reservations">
            <Reservations items={reservations} />
          </CardSection>
        </Box>
      </AgentDesktopShell>
    </Box>
  );
}

const queryClient = new QueryClient();

export default function App() {
  const [ctx, setCtx] = useState(null);
  if (!ctx) return <Login onReady={setCtx} />;

  const onIdle = () => {
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
