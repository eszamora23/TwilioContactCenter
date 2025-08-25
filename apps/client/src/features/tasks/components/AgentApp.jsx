// contact-center/client/src/features/tasks/components/AgentApp.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { Toaster, useToaster } from '@twilio-paste/core/toast';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@twilio-paste/core/tabs';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { Badge } from '@twilio-paste/core/badge';
import { Box as PBox } from '@twilio-paste/core/box';
import { Switch } from '@twilio-paste/core/switch';

import Api from '../../index.js';
import { useWorker } from '../hooks/useWorker.js';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';
import { SOFTPHONE_CHANNEL_KEY, SOFTPHONE_POPUP_FEATURES } from '../../softphone/constants.js';

import ChatPanel from '../../../chat/ChatPanel.jsx';
import StatusBar from './StatusBar.jsx';
import Softphone from '../../softphone/components/Softphone.jsx';
import Presence from './Presence.jsx';
import Customer360 from './Customer360.jsx';
import TasksPanel from './TasksPanel.jsx';
import Reservations from './Reservations.jsx';
import AgentDesktopShell from './AgentDesktopShell.jsx';
import CallControlsModal from '../../softphone/components/CallControlsModal.jsx';
import CardSection from '../../../shared/components/CardSection.jsx';

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const socketBase = import.meta.env.VITE_SOCKET_BASE || new URL(baseURL).origin;

const SOFTPHONE_WINDOW_NAME = 'softphone_popup';
const SOFTPHONE_URL = () => `${window.location.origin}?popup=softphone`;

export default function AgentApp() {
  const queryClient = useQueryClient();
  const toaster = useToaster();

  const invalidateTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    queryClient.invalidateQueries({ queryKey: ['myTask'] });
  }, [queryClient]);

  const { worker, activity, reservations, setAvailable } = useWorker();

  // Tabs
  const [mode, setMode] = useLocalStorage('desktop_mode', 'voice');

  // CHAT tabs
  const [chatSessions, setChatSessions] = useState([]);
  const chatJoinedRef = useRef(new Set());
  const joinPendingRef = useRef(new Set());
  const [chatPanelKey, setChatPanelKey] = useState(0);

  const [chatBadge, setChatBadge] = useState(0);
  useEffect(() => { if (mode === 'chat') setChatBadge(0); }, [mode]);

  // Softphone
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasCall, setHasCall] = useState(false);

  // Default OFF; persisted when user turns it ON
  const [isSoftphonePopout, setSoftphonePopout] = useLocalStorage('softphone_popout', false);

  const softphoneWinRef = useRef(null);
  const prevCallStatusRef = useRef('Idle');
  const lastOpenAttemptRef = useRef(0);

  /* ================================
   * Single popup window (not a tab)
   * ================================ */
  const getExistingSoftphoneWindow = useCallback(() => {
    try {
      const w = window.open('', SOFTPHONE_WINDOW_NAME);
      if (w && !w.closed) return w;
    } catch {}
    return null;
  }, []);

  const openSoftphoneWindow = useCallback(() => {
    // Avoid burst open
    const now = Date.now();
    if (now - lastOpenAttemptRef.current < 600) {
      return softphoneWinRef.current || null;
    }
    lastOpenAttemptRef.current = now;

    // 1) Try to reuse by name
    let w = getExistingSoftphoneWindow();

    // 2) Open FINAL URL directly during the user gesture (more likely to be treated as a true popup)
    if (!w) {
      w = window.open(SOFTPHONE_URL(), SOFTPHONE_WINDOW_NAME, SOFTPHONE_POPUP_FEATURES);
      if (!w) return null; // blocked by the browser
    } else {
      try {
        const href = w.location?.href || '';
        if (!href.includes('?popup=softphone')) {
          w.location.replace(SOFTPHONE_URL());
        }
      } catch {}
    }

    // Best effort focus and isolation
    try { w.opener = null; } catch {}
    try { w.focus(); } catch {}

    softphoneWinRef.current = w;
    return w;
  }, [getExistingSoftphoneWindow]);

  const closeSoftphoneWindow = useCallback(() => {
    try { softphoneWinRef.current?.close(); } catch {}
    softphoneWinRef.current = null;
  }, []);

  /* ================================
   * Sync channel & close handling
   * ================================ */
  useEffect(() => {
    let channel;
    const onMsg = (evt) => {
      const { type, payload } = evt.data || {};

      if (type === 'state') {
        const status = payload?.callStatus || 'Idle';
        setHasCall(status === 'In Call' || status === 'Incoming');
        if (prevCallStatusRef.current !== 'Incoming' && status === 'Incoming') {
          toaster.push({ message: 'Incoming call', variant: 'warning', dismissAfter: 4000 });
        }
        prevCallStatusRef.current = status;
      } else if (type === 'popup-closed') {
        // User closed the popup → turn OFF toggle and show inline
        softphoneWinRef.current = null;
        setSoftphonePopout(false);
      }
    };

    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(SOFTPHONE_CHANNEL_KEY);
      channel.onmessage = onMsg;
    } else {
      const storageHandler = (e) => {
        if (e.key === SOFTPHONE_CHANNEL_KEY && e.newValue) {
          try { onMsg({ data: JSON.parse(e.newValue) }); } catch {}
        }
      };
      window.addEventListener('storage', storageHandler);
      channel = { close: () => window.removeEventListener('storage', storageHandler) };
    }

    return () => { try { channel?.close?.(); } catch {} };
  }, [setSoftphonePopout, toaster]);

  // Safety poll in case the close event doesn't arrive
  useEffect(() => {
    if (!isSoftphonePopout) return;
    const it = setInterval(() => {
      if (softphoneWinRef.current && softphoneWinRef.current.closed) {
        softphoneWinRef.current = null;
        setSoftphonePopout(false); // OFF → inline automatically
      }
    }, 700);
    return () => clearInterval(it);
  }, [isSoftphonePopout, setSoftphonePopout]);

  /* ================================
   * Toggle (user gesture only)
   * ================================ */
  const handleSoftphoneToggle = useCallback((checked) => {
    if (checked) {
      const w = openSoftphoneWindow(); // must be synchronous in the change handler
      if (w) {
        setSoftphonePopout(true);    // persist ON only if a real window exists
      } else {
        setSoftphonePopout(false);
        setTimeout(() => toaster.push({ message: 'Popup blocked by browser', variant: 'error' }), 0);
      }
    } else {
      closeSoftphoneWindow();
      setSoftphonePopout(false);     // OFF → inline
    }
  }, [openSoftphoneWindow, closeSoftphoneWindow, setSoftphonePopout, toaster]);

  /* ================================
   * CHAT helpers
   * ================================ */
  const prioritizeChat = useCallback((sid) => {
    setChatSessions((prev) => {
      const idx = prev.findIndex((s) => s.sid === sid);
      if (idx <= 0) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  }, []);

  const ensureChatSession = useCallback(async (conversationSid, labelHint) => {
    if (!conversationSid) return false;

    if (chatJoinedRef.current.has(conversationSid)) {
      setChatSessions((prev) => {
        if (prev.some((s) => s.sid === conversationSid)) return prev;
        return [...prev, { sid: conversationSid, label: labelHint || conversationSid, unread: 0 }];
      });
      return true;
    }

    if (joinPendingRef.current.has(conversationSid)) return true;
    joinPendingRef.current.add(conversationSid);

    try {
      const tokenResp = await fetch(`${baseURL}/api/chat/token`, { credentials: 'include' });
      if (!tokenResp.ok) throw new Error(`chat token: ${tokenResp.status}`);
      const { identity } = await tokenResp.json();

      const joinResp = await fetch(`${baseURL}/api/conversations/${conversationSid}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'chat', identity, attributes: { role: 'agent' } }),
      });

      let ok = joinResp.ok || joinResp.status === 409;
      if (!ok) {
        const err = await joinResp.json().catch(() => ({}));
        if (err?.error?.code === 50433) ok = true;
      }
      if (!ok) return false;

      setChatSessions((prev) => {
        if (prev.some((s) => s.sid === conversationSid)) return prev;
        return [...prev, { sid: conversationSid, label: labelHint || conversationSid, unread: 0 }];
      });
      chatJoinedRef.current.add(conversationSid);
      return true;
    } catch (e) {
      console.error('[ensureChatSession]', e);
      return false;
    } finally {
      joinPendingRef.current.delete(conversationSid);
    }
  }, []);

  const selectChatFromTasks = useCallback(
    async (sid) => {
      if (!sid) return;
      const ok = await ensureChatSession(sid);
      if (!ok) return;
      prioritizeChat(sid);
      setMode('chat');
      setChatPanelKey((k) => k + 1);
      requestAnimationFrame(() => {
        document.getElementById('main-chat-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [ensureChatSession, prioritizeChat, setMode]
  );

  // worker & sockets (same behavior as before)
  const notifiedConvosRef = useRef(new Set());
  const processedTaskCreatedRef = useRef(new Set());

  useEffect(() => {
    if (!worker) return;

    const onCreated = async (r) => {
      try {
        const a = r?.task?.attributes || {};
        if (a.channel === 'chat') {
          const sid = a.conversationSid || a.conversation_sid;
          const label = a.customerName || a.from || a.name || sid;
          if (sid) await ensureChatSession(sid, label);
        }
        invalidateTasks();
      } catch (e) {
        console.warn('[worker reservation.created handler]', e);
      }
    };

    const onAccepted = async (r) => {
      try {
        const a = r?.task?.attributes || {};
        if (a.channel !== 'chat') return;
        const sid = a.conversationSid || a.conversation_sid;
        const label = a.customerName || a.from || a.name || sid;
        if (sid && !notifiedConvosRef.current.has(sid)) {
          notifiedConvosRef.current.add(sid);
          await ensureChatSession(sid, label);
          toaster.push({ message: label ? `New chat assigned: ${label}` : 'New chat assigned', variant: 'warning', dismissAfter: 6000 });
        }
        invalidateTasks();
      } catch (e) {
        console.warn('[worker reservation.accepted handler]', e);
      }
    };

    try { worker.off('reservation.created', onCreated); } catch {}
    try { worker.off('reservation.accepted', onAccepted); } catch {}
    worker.on('reservation.created', onCreated);
    worker.on('reservation.accepted', onAccepted);

    return () => {
      try { worker.off('reservation.created', onCreated); } catch {}
      try { worker.off('reservation.accepted', onAccepted); } catch {}
    };
  }, [worker, ensureChatSession, invalidateTasks, toaster]);

  useEffect(() => {
    if (!worker) return;
    const refresh = () => invalidateTasks();
    const evs = ['reservation.rejected','reservation.timeout','reservation.canceled','reservation.completed','activity.update'];
    evs.forEach((e) => { try { worker.on(e, refresh); } catch {} });
    return () => evs.forEach((e) => { try { worker.off(e, refresh); } catch {} });
  }, [worker, invalidateTasks]);

  useEffect(() => {
    const socket = io(socketBase, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: false,
    });

    socket.on('task_created', async ({ conversationSid }) => {
      try {
        if (!conversationSid) return;
        if (processedTaskCreatedRef.current.has(conversationSid)) return;
        processedTaskCreatedRef.current.add(conversationSid);
        await ensureChatSession(conversationSid);
        invalidateTasks();
      } catch (e) {
        console.warn('[socket task_created handler]', e);
      }
    });

    socket.on('connect_error', (err) =>
      console.warn('[socket.io] connect_error', err?.message || err)
    );

    return () => socket.disconnect();
  }, [ensureChatSession, invalidateTasks]);

  const logout = useCallback(async () => {
    await Api.logout();
    try { localStorage.removeItem('agent_ctx'); } catch {}
    const offlineSid = 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Activity Offline real si aplica
    try { await setAvailable(offlineSid); } catch {}
    window.location.reload();
  }, [setAvailable]);

  /* ================================
   * Header actions
   * ================================ */
  const headerActions = useMemo(() => (
    <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }} alignment="center">
      <StatusBar inline label={activity || '—'} onChange={(sid) => setAvailable(sid)} />
      <Switch
        checked={isSoftphonePopout}
        onChange={(e) => handleSoftphoneToggle(e.target.checked)}
        aria-label="Softphone pop-out"
      >
        Softphone window
      </Switch>
      {hasCall && <Button variant="primary" onClick={() => setControlsOpen(true)}>Call controls</Button>}
      <Button variant="destructive" onClick={logout}>Logout</Button>
    </Stack>
  ), [activity, setAvailable, isSoftphonePopout, handleSoftphoneToggle, hasCall, logout]);

  /* ================================
   * Sections per mode
   * ================================ */
  const voiceSections = useMemo(() => ([
    { id: 'softphone', label: 'Softphone' },
    { id: 'customer360', label: 'Customer 360' },
    { id: 'voiceTasks', label: 'Voice Tasks' },
  ]), []);

  const supervisorSections = useMemo(() => ([
    { id: 'reservations', label: 'Reservations' },
    { id: 'presence', label: 'Presence' },
  ]), []);

  const chatSections = useMemo(() => ([
    { id: 'mainChat', label: 'Main Chat' },
    { id: 'chatTasks', label: 'Chat Tasks' },
    { id: 'customer360-chat', label: 'Customer 360' },
  ]), []);

  const shellQuickActions = useMemo(() => ({
    voice: [
      { label: 'Softphone', targetId: 'softphone', variant: 'secondary' },
      { label: 'Customer 360', targetId: 'customer360' },
      { label: 'Voice Tasks', targetId: 'voiceTasks' },
    ],
    chat: [
      { label: 'Main Chat', targetId: 'mainChat', variant: 'primary' },
      { label: 'Chat Tasks', targetId: 'chatTasks' },
      { label: 'Customer 360', targetId: 'customer360-chat' },
    ],
    supervisor: [
      { label: 'Reservations', targetId: 'reservations' },
      { label: 'Presence', targetId: 'presence' },
    ],
  }), []);

  /* ================================
   * Render
   * ================================ */
  return (
    <Box minHeight="100vh" width="100%">
      <Toaster {...toaster} />

      {/* Call controls modal */}
      <CallControlsModal isOpen={controlsOpen} onDismiss={() => setControlsOpen(false)} />

      <AgentDesktopShell
        sections={mode === 'voice' ? voiceSections : mode === 'chat' ? chatSections : supervisorSections}
        title="Agent Desktop"
        actions={headerActions}
        mode={mode}
        quickActions={shellQuickActions}
      >
        <Box marginBottom="space70">
          <Tabs baseId="workspace-mode" selectedId={mode} onTabChange={(id) => setMode(id)}>
            <TabList aria-label="Workspace mode">
              <Tab id="voice">VOICE</Tab>
              <Tab id="chat">
                <PBox display="inline-flex" alignItems="center" columnGap="space20">
                  CHAT
                  {chatBadge > 0 && <Badge as="span" variant="new">{chatBadge}</Badge>}
                </PBox>
              </Tab>
              <Tab id="supervisor">SUPERVISOR</Tab>
            </TabList>

            <TabPanels>
              {/* VOICE */}
              <TabPanel id="voice">
                <Stack orientation="vertical" spacing="space70">
                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">
                      Active Call Handling
                    </Heading>

                    <CardSection id="softphone" title="Softphone">
                      {/* OFF → inline visible; ON → inline hidden (hook stays mounted in main) */}
                      <Softphone popupOpen={isSoftphonePopout} />
                    </CardSection>

                    <Box marginY="space40"><Separator orientation="horizontal" /></Box>

                    <CardSection id="customer360" title="Customer 360">
                      <Customer360 />
                    </CardSection>

                    <Box marginY="space40"><Separator orientation="horizontal" /></Box>

                    <CardSection id="voiceTasks" title="Voice Tasks">
                      <TasksPanel channel="voice" setAvailable={setAvailable} />
                    </CardSection>
                  </Box>
                </Stack>
              </TabPanel>

              {/* CHAT */}
              <TabPanel id="chat">
                <Stack orientation="vertical" spacing="space70">
                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">Active Conversations</Heading>
                    <CardSection id="mainChat" title="Main Chat">
                      <Box id="main-chat-panel" minHeight="60vh">
                        {chatSessions.length ? (
                          <ChatPanel
                            key={chatPanelKey}
                            sessions={chatSessions}
                            onClose={(sid) =>
                              setChatSessions((prev) => prev.filter((s) => s.sid !== sid))
                            }
                            onIncrementUnread={(sid) =>
                              setChatSessions((prev) =>
                                prev.map((s) =>
                                  s.sid === sid ? { ...s, unread: (s.unread || 0) + 1 } : s
                                )
                              )
                            }
                            onClearUnread={(sid) =>
                              setChatSessions((prev) =>
                                prev.map((s) => (s.sid === sid ? { ...s, unread: 0 } : s))
                              )
                            }
                            onLabel={(sid, label) =>
                              setChatSessions((prev) =>
                                prev.map((s) => (s.sid === sid ? { ...s, label } : s))
                              )
                            }
                            onPopout={(sid) => {
                              const url = `${window.location.origin}?popup=chat&sid=${encodeURIComponent(sid)}`;
                              window.open(url, `chat_${sid}`, SOFTPHONE_POPUP_FEATURES);
                            }}
                          />
                        ) : (
                          <Box color="colorTextWeak">No active chats</Box>
                        )}
                      </Box>
                    </CardSection>
                  </Box>

                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">Tasks & Customer Info</Heading>
                    <CardSection id="chatTasks" title="Chat Tasks">
                      <TasksPanel channel="chat" onOpenChat={selectChatFromTasks} />
                    </CardSection>
                    <Box marginY="space40"><Separator orientation="horizontal" /></Box>
                    <CardSection id="customer360-chat" title="Customer 360">
                      <Customer360 />
                    </CardSection>
                  </Box>
                </Stack>
              </TabPanel>

              {/* SUPERVISOR */}
              <TabPanel id="supervisor">
                <Stack orientation="vertical" spacing="space70">
                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">Tasks & Incoming</Heading>
                    <CardSection id="reservations" title="Reservations">
                      <Reservations items={reservations} standalone />
                    </CardSection>
                  </Box>

                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">Team Presence</Heading>
                    <CardSection id="presence" title="Presence">
                      <Presence />
                    </CardSection>
                  </Box>
                </Stack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </AgentDesktopShell>
    </Box>
  );
}