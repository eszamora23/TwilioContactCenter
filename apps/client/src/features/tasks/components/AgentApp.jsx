// contact-center/client/src/components/AgentApp.jsx
import { useState, useEffect, useRef } from 'react';
import ChatPanel from '../../../chat/ChatPanel.jsx';
import { Client as ConversationsClient } from '@twilio/conversations';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { Toaster } from '@twilio-paste/core/toast';
import { CallIcon } from '@twilio-paste/icons/esm/CallIcon';

import Api from '../../index.js';
import { useWorker } from '../hooks/useWorker.js';
import StatusBar from './StatusBar.jsx';
import Softphone from '../../softphone/components/Softphone.jsx';
import Presence from './Presence.jsx';
import Customer360 from './Customer360.jsx';
import TasksPanel from './TasksPanel.jsx';
import Reservations from './Reservations.jsx';
import AgentDesktopShell from './AgentDesktopShell.jsx';
import ActivityQuickSwitch from './ActivityQuickSwitch.jsx';
import CallControlsModal from '../../softphone/components/CallControlsModal.jsx';
import CardSection from '../../../shared/components/CardSection.jsx';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';

export default function AgentApp() {
  const { worker, activity, reservations, setAvailable } = useWorker();
  const [chatSessions, setChatSessions] = useState([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasCall, setHasCall] = useState(false);
  const [isSoftphonePopout, setSoftphonePopout] = useLocalStorage(
    'softphone_popout',
    false
  );
  const softphoneWinRef = useRef(null);

  useEffect(() => {
    const KEY = 'softphone-control';
    let ch;

    const onMessage = (evt) => {
      const { type, payload } = evt.data || {};
      if (type === 'state') {
        setHasCall(payload.callStatus === 'In Call' || payload.callStatus === 'Incoming');
      }
      if (type === 'popup-closed') {
        setSoftphonePopout(false);
        softphoneWinRef.current = null;
      }
    };

    if (typeof window !== 'undefined' && typeof BroadcastChannel === 'function') {
      ch = new BroadcastChannel(KEY);
      ch.onmessage = onMessage;
    } else {
      const storageHandler = (e) => {
        if (e.key === KEY && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            onMessage({ data });
          } catch (err) {
            console.error('[agentApp storage channel parse error]', err);
          }
        }
      };
      window.addEventListener('storage', storageHandler);
      ch = { close: () => window.removeEventListener('storage', storageHandler) };
    }

    return () => {
      try { ch.close(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!worker) return;
    const handler = async (r) => {
      try {
        const attrs = r.task?.attributes || {};
        if (attrs.channel === 'chat') {
          const conversationSid = attrs.conversationSid || attrs.conversation_sid;
          const tokenResp = await fetch('/api/chat/token');
          const { token, identity } = await tokenResp.json();
          let isParticipant = true;
          let client;
          try {
            client = await ConversationsClient.create(token);
            await client.getConversationBySid(conversationSid);
          } catch (err) {
            isParticipant = false;
          } finally {
            try { await client?.shutdown?.(); } catch {}
          }
          if (!isParticipant) {
            await fetch(`/api/conversations/${conversationSid}/participants`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'chat', identity }),
            });
          }

          const label =
            attrs.customerName || attrs.from || attrs.name || conversationSid;
          setChatSessions((prev) => {
            if (prev.some((s) => s.sid === conversationSid)) return prev;
            return [...prev, { sid: conversationSid, label, unread: 0 }];
          });
        }
      } catch (e) {
        console.error('reservation.accepted handler error', e);
      }
    };
    worker.on('reservation.accepted', handler);
    return () => {
      try {
        worker.removeListener('reservation.accepted', handler);
      } catch {}
    };
  }, [worker]);

  const sections = [
    { id: 'softphone', label: 'Softphone', content: () => <Softphone popupOpen={isSoftphonePopout} /> },
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
    await Api.logout();
    const offlineSid = 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // tu Activity SID "Offline"/Break
    await setAvailable(offlineSid);
    window.location.reload();
  }

  useEffect(() => {
    if (!isSoftphonePopout || softphoneWinRef.current) return;
    const w = window.open(
      `${window.location.origin}?popup=softphone`,
      'softphone_popup',
      [
        'width=420',
        'height=640',
        'menubar=no',
        'toolbar=no',
        'resizable=yes',
        'status=no',
        'scrollbars=yes',
      ].join(',')
    );
    if (w) {
      softphoneWinRef.current = w;
    } else {
      setSoftphonePopout(false);
    }
  }, [isSoftphonePopout]);

  function toggleSoftphonePopout() {
    if (isSoftphonePopout) {
      try {
        softphoneWinRef.current?.close();
      } catch {}
      softphoneWinRef.current = null;
      setSoftphonePopout(false);
    } else {
      setSoftphonePopout(true);
    }
  }

  const headerActions = (
    <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
      <ActivityQuickSwitch
        label={activity || '—'}
        onChange={(sid) => setAvailable(sid)}
      />
      <Button
        variant={isSoftphonePopout ? 'primary' : 'secondary'}
        onClick={toggleSoftphonePopout}
        aria-pressed={isSoftphonePopout}
        aria-label={
          isSoftphonePopout ? 'Close softphone pop-out' : 'Open softphone pop-out'
        }
        title={
          isSoftphonePopout ? 'Close softphone pop-out' : 'Open softphone pop-out'
        }
      >
        <CallIcon decorative color={isSoftphonePopout ? 'colorTextInverse' : undefined} />
      </Button>
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
      {chatSessions.length > 0 && (
        <Box marginBottom="space70">
          <ChatPanel
            sessions={chatSessions}
            onClose={(sid) =>
              setChatSessions((prev) => prev.filter((s) => s.sid !== sid))
            }
          />
        </Box>
      )}

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

