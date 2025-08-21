import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { Button } from '@twilio-paste/core/button';
import { Badge } from '@twilio-paste/core/badge';

import Softphone from './Softphone.jsx';
import Customer360 from './Customer360.jsx';
import TasksPanel from './TasksPanel.jsx';
import Presence from './Presence.jsx';
import Reservations from './Reservations.jsx';

function Section({ title, subtitle, actions, children }) {
  return (
    <Box
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
      display="flex"
      flexDirection="column"
      height="100%"
      minHeight="0"
    >
      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        distribution="spaceBetween"
        alignment="center"
        style={{ flexWrap: 'wrap' }}
      >
        <Stack orientation="vertical" spacing="space20">
          <Heading as="h4" variant="heading40" margin="space0">
            {title}
          </Heading>
          {subtitle ? (
            <Box color="colorTextWeak" fontSize="fontSize30">
              {subtitle}
            </Box>
          ) : null}
        </Stack>
        {actions ? (
          <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>

      <Separator orientation="horizontal" verticalSpacing="space50" />

      <Box flexGrow={1} minHeight="0" overflow="auto">
        {children}
      </Box>
    </Box>
  );
}

function KPI({ label, value }) {
  return (
    <Box
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space60"
      minWidth="180px"
      flexGrow={1}
    >
      <Box fontSize="fontSize90" fontWeight="fontWeightSemibold" lineHeight="lineHeight90">
        {value}
      </Box>
      <Box color="colorTextWeak" marginTop="space20" fontSize="fontSize30">
        {label}
      </Box>
    </Box>
  );
}

const GRID_HEIGHT = 'calc(100vh - 200px)';

export default function AgentWorkspace({ reservations, setAvailable }) {
  return (
    <Box width="100%" height="100%" overflow="hidden">
      <style>{`
        :root{
          --aw-gutter: var(--paste-space-70);
          --aw-gridH: ${GRID_HEIGHT};
        }
        .aw{
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: repeat(5, 1fr);
          gap: var(--aw-gutter);
          height: var(--aw-gridH);
          min-height: 0;
        }
        .aw__cell{ min-height: 0; height: 100%; }
      `}</style>

      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space50"
        alignment="center"
        distribution="spaceBetween"
        style={{ flexWrap: 'wrap' }}
      >
        <Heading as="h3" variant="heading30" margin="space0">
          Agent Workspace
        </Heading>
        <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
          <Badge as="span" variant="new">Live</Badge>
          <Badge as="span" variant="neutral">Demo</Badge>
        </Stack>
      </Stack>

      <Box marginTop="space60">
        <Stack orientation={['vertical', 'horizontal']} spacing="space60" style={{ flexWrap: 'wrap' }}>
          <KPI label="Calls Today" value="12" />
          <KPI label="Active Tasks" value="3" />
          <KPI label="Avg SLA" value="00:37" />
          <KPI label="CSAT (demo)" value="4.8" />
        </Stack>
      </Box>

      <Separator orientation="horizontal" verticalSpacing="space70" />

      <Box className="aw">
        <Box className="aw__cell">
          <Section title="Softphone" subtitle="Controles de llamada">
            <Softphone />
          </Section>
        </Box>

        <Box className="aw__cell">
          <Section title="Presence" subtitle="Agentes disponibles">
            <Presence />
          </Section>
        </Box>

        <Box className="aw__cell">
          <Section
            title="Customer 360"
            subtitle="Contexto unificado del cliente"
            actions={
              <>
                <Button variant="secondary" disabled>New Appointment</Button>
                <Button variant="secondary" disabled>Send PayLink</Button>
              </>
            }
          >
            <Customer360 />
          </Section>
        </Box>

        <Box className="aw__cell">
          <Section title="Tasks" subtitle="Tareas activas y wrap-up">
            <TasksPanel setAvailable={setAvailable} />
          </Section>
        </Box>

        <Box className="aw__cell">
          <Section title="Reservations" subtitle="Reservas del worker">
            <Reservations items={reservations} />
          </Section>
        </Box>
      </Box>
    </Box>
  );
}