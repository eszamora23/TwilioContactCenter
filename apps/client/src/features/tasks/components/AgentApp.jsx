// contact-center/client/src/features/tasks/components/AgentApp.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Button } from '@twilio-paste/core/button';
import { Toaster, useToaster } from '@twilio-paste/core/toast';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@twilio-paste/core/tabs';
import { CallIcon } from '@twilio-paste/icons/esm/CallIcon';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { Badge } from '@twilio-paste/core/badge';
import { Box as PBox } from '@twilio-paste/core/box';

import Api from '../../index.js';
import { useWorker } from '../hooks/useWorker.js';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';
import {
  SOFTPHONE_CHANNEL_KEY,
  SOFTPHONE_POPUP_FEATURES,
} from '../../softphone/constants.js';

import ChatPanel from '../../../chat/ChatPanel.jsx';
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

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const socketBase = import.meta.env.VITE_SOCKET_BASE || new URL(baseURL).origin;

export default function AgentApp() {
  const { worker, activity, reservations, setAvailable } = useWorker();
  const toaster = useToaster();

  // Mode: 'voice' | 'chat'
  const [mode, setMode] = useLocalStorage('desktop_mode', 'voice');

  // Chat sessions (tabs)
  const [chatSessions, setChatSessions] = useState([]); // [{ sid, label, unread }]
  const chatJoinedRef = useRef(new Set());
  const joinPendingRef = useRef(new Set()); // evita reintentos concurrentes
  const [chatPanelKey, setChatPanelKey] = useState(0);

  // UI badge for CHAT tab
  const [chatBadge, setChatBadge] = useState(0);
  useEffect(() => { if (mode === 'chat') setChatBadge(0); }, [mode]);

  // Voice / popout state
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasCall, setHasCall] = useState(false);
  const [isSoftphonePopout, setSoftphonePopout] = useLocalStorage('softphone_popout', false);
  const softphoneWinRef = useRef(null);
  const prevCallStatusRef = useRef('Idle');

  // Dedupe helpers
  const notifiedConvosRef = useRef(new Set());       // evita toasts duplicados
  const processedTaskCreatedRef = useRef(new Set()); // evita task_created duplicados

  /* --------------------------------
   * Helpers
   * -------------------------------- */
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

    // ya unido o ya en pantalla
    if (chatJoinedRef.current.has(conversationSid)) {
      setChatSessions((prev) => {
        if (prev.some((s) => s.sid === conversationSid)) return prev;
        return [...prev, { sid: conversationSid, label: labelHint || conversationSid, unread: 0 }];
      });
      return true;
    }

    // evita que diferentes fuentes (socket/TR/poll) se solapen
    if (joinPendingRef.current.has(conversationSid)) return true;
    joinPendingRef.current.add(conversationSid);

    try {
      // 1) identity (cookie session)
      const tokenResp = await fetch(`${baseURL}/api/chat/token`, { credentials: 'include' });
      if (!tokenResp.ok) throw new Error(`chat token: ${tokenResp.status}`);
      const { identity } = await tokenResp.json();

      // 2) ensure participant
      const joinResp = await fetch(`${baseURL}/api/conversations/${conversationSid}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'chat', identity, attributes: { role: 'agent' } }),
      });

      let ok = joinResp.ok || joinResp.status === 409;
      if (!ok) {
        const err = await joinResp.json().catch(() => ({}));
        if (err?.error?.code === 50433) ok = true; // already in
      }
      if (!ok) return false;

      // 3) add to panel
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

  const popoutChat = useCallback((sid) => {
    const url = `${window.location.origin}?popup=chat&sid=${encodeURIComponent(sid)}`;
    window.open(url, `chat_${sid}`, SOFTPHONE_POPUP_FEATURES);
  }, []);

  /* --------------------------------
   * Notify helpers (toast + OS Notification + chime)
   * -------------------------------- */
  const playChime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
      o.stop(ctx.currentTime + 0.34);
    } catch {}
  }, []);

  const notifyChatAssigned = useCallback((convoSid, label) => {
    if (!convoSid) return;
    // evita notificaciones repetidas del mismo chat
    if (notifiedConvosRef.current.has(convoSid)) return;
    notifiedConvosRef.current.add(convoSid);

    const title = 'New chat assigned';
    toaster.push({
      message: label ? `${title}: ${label}` : title,
      variant: 'warning',
      dismissAfter: 6000
    });

    // System notification (click switches to chat)
    try {
      if ('Notification' in window) {
        const openIt = () => {
          window.focus();
          selectChatFromTasks(convoSid);
        };
        if (Notification.permission === 'granted') {
          const n = new Notification(title, { body: label || '' });
          n.onclick = openIt;
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              const n = new Notification(title, { body: label || '' });
              n.onclick = openIt;
            }
          });
        }
      }
    } catch {}

    playChime();
    setChatBadge((c) => c + 1);
  }, [playChime, selectChatFromTasks, toaster]);

  /* --------------------------------
   * Voice state via BroadcastChannel
   * -------------------------------- */
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
        setSoftphonePopout(false);
        softphoneWinRef.current = null;
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

  /* --------------------------------
   * Worker signals → ensure chat joins + notify when ASSIGNED
   * (evita memory leak: depend only on worker; use refs for callbacks)
   * -------------------------------- */
  const ensureChatSessionRef = useRef(ensureChatSession);
  const notifyChatAssignedRef = useRef(notifyChatAssigned);
  useEffect(() => { ensureChatSessionRef.current = ensureChatSession; }, [ensureChatSession]);
  useEffect(() => { notifyChatAssignedRef.current = notifyChatAssigned; }, [notifyChatAssigned]);

  useEffect(() => {
    if (!worker) return;

    const onCreated = async (r) => {
      try {
        const a = r?.task?.attributes || {};
        if (a.channel === 'chat') {
          const sid = a.conversationSid || a.conversation_sid;
          const label = a.customerName || a.from || a.name || sid;
          if (sid) await ensureChatSessionRef.current?.(sid, label);
        }
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
        if (sid) {
          await ensureChatSessionRef.current?.(sid, label);
          notifyChatAssignedRef.current?.(sid, label);
        }
      } catch (e) {
        console.warn('[worker reservation.accepted handler]', e);
      }
    };

    // Limpia posibles escuchas previas con mismas referencias
    try { worker.off('reservation.created', onCreated); } catch {}
    try { worker.off('reservation.accepted', onAccepted); } catch {}

    worker.on('reservation.created', onCreated);
    worker.on('reservation.accepted', onAccepted);

    return () => {
      try { worker.off('reservation.created', onCreated); } catch {}
      try { worker.off('reservation.accepted', onAccepted); } catch {}
    };
  }, [worker]);

  // Safety-net polling to join sessions
  useEffect(() => {
    if (!worker) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const tasks = await Api.myTasks('assigned,reserved');
        for (const t of tasks) {
          const a = t.attributes || {};
          if (a.channel === 'chat') {
            const sid = a.conversationSid || a.conversation_sid;
            const label = a.customerName || a.from || a.name || sid;
            if (!cancelled && sid) await ensureChatSessionRef.current?.(sid, label);
          }
        }
      } catch (e) { console.error('[task poll]', e); }
    };

    poll();
    const it = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(it); };
  }, [worker]);

  // Realtime “task_created” (first inbound message) — dedupe por SID
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
        await ensureChatSessionRef.current?.(conversationSid);
      } catch (e) {
        console.warn('[socket task_created handler]', e);
      }
    });

    socket.on('connect_error', (err) =>
      console.warn('[socket.io] connect_error', err?.message || err)
    );

    return () => socket.disconnect();
  }, []);

  /* --------------------------------
   * Softphone popout
   * -------------------------------- */
  const openSoftphoneWindow = useCallback(() => {
    const url = `${window.location.origin}?popup=softphone`;
    const w = window.open(url, 'softphone_popup', SOFTPHONE_POPUP_FEATURES);
    if (w) softphoneWinRef.current = w;
  }, []);

  const toggleSoftphonePopout = useCallback(() => {
    if (isSoftphonePopout) {
      try { softphoneWinRef.current?.close(); } catch {}
      softphoneWinRef.current = null;
      setSoftphonePopout(false);
    } else {
      openSoftphoneWindow();
      setSoftphonePopout(true);
    }
  }, [isSoftphonePopout, setSoftphonePopout, openSoftphoneWindow]);

  // Auto-open popout when becoming Available (optional behavior preserved)
  useEffect(() => {
    if (/available/i.test(activity || '') && !isSoftphonePopout) {
      openSoftphoneWindow();
      setSoftphonePopout(true);
    }
  }, [activity, isSoftphonePopout, setSoftphonePopout, openSoftphoneWindow]);

  const logout = useCallback(async () => {
    await Api.logout();
    const offlineSid = 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // TODO: replace with real Activity SID if needed
    try { await setAvailable(offlineSid); } catch {}
    window.location.reload();
  }, [setAvailable]);

  /* --------------------------------
   * Header actions & quick actions
   * -------------------------------- */
  const headerActions = useMemo(() => (
    <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
      <ActivityQuickSwitch label={activity || '—'} onChange={(sid) => setAvailable(sid)} />
      <Button
        variant={isSoftphonePopout ? 'primary' : 'secondary'}
        onClick={toggleSoftphonePopout}
        aria-pressed={isSoftphonePopout}
        aria-label={isSoftphonePopout ? 'Close softphone pop-out' : 'Open softphone pop-out'}
        title={isSoftphonePopout ? 'Close softphone pop-out' : 'Open softphone pop-out'}
      >
        <CallIcon decorative color={isSoftphonePopout ? 'colorTextInverse' : undefined} />
      </Button>
      {hasCall && <Button variant="primary" onClick={() => setControlsOpen(true)}>Call controls</Button>}
      <Button variant="destructive" onClick={logout}>Logout</Button>
    </Stack>
  ), [activity, setAvailable, isSoftphonePopout, toggleSoftphonePopout, hasCall, logout]);

  const voiceSections = useMemo(() => ([
    { id: 'softphone', label: 'Softphone' },
    { id: 'customer360', label: 'Customer 360' },
    { id: 'reservations', label: 'Reservations' },
    { id: 'voiceTasks', label: 'Voice Tasks' },
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
      { label: isSoftphonePopout ? 'Close Popout' : 'Open Popout', onClick: toggleSoftphonePopout, variant: isSoftphonePopout ? 'destructive' : 'primary' },
      ...(hasCall ? [{ label: 'Call controls', onClick: () => setControlsOpen(true), variant: 'primary' }] : []),
      { label: 'Voice Tasks', targetId: 'voiceTasks' },
      { label: 'Customer 360', targetId: 'customer360' },
    ],
    chat: [
      { label: 'Main Chat', targetId: 'mainChat', variant: 'primary' },
      { label: 'Chat Tasks', targetId: 'chatTasks' },
      { label: 'Customer 360', targetId: 'customer360-chat' },
    ],
  }), [isSoftphonePopout, toggleSoftphonePopout, hasCall]);

  /* --------------------------------
   * Render
   * -------------------------------- */
  return (
    <Box minHeight="100vh" width="100%">
      <Toaster {...toaster} />

      {/* Sticky global bar */}
      <Box marginBottom="space70">
        <StatusBar label={activity || '…'} onChange={(sid) => setAvailable(sid)} />
      </Box>

      <CallControlsModal isOpen={controlsOpen} onDismiss={() => setControlsOpen(false)} />

      <AgentDesktopShell
        sections={mode === 'voice' ? voiceSections : chatSections}
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
                  {chatBadge > 0 && (
                    <Badge as="span" variant="new">{chatBadge}</Badge>
                  )}
                </PBox>
              </Tab>
            </TabList>

            <TabPanels>
              {/* VOICE */}
              <TabPanel id="voice">
                <Stack orientation="vertical" spacing="space70">
                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">Active Call Handling</Heading>
                    <CardSection id="softphone" title="Softphone">
                      <Softphone popupOpen={isSoftphonePopout} />
                    </CardSection>
                    <Box marginY="space40"><Separator orientation="horizontal" /></Box>
                    <CardSection id="customer360" title="Customer 360">
                      <Customer360 />
                    </CardSection>
                  </Box>

                  <Box>
                    <Heading as="h2" variant="heading30" marginBottom="space40">Tasks & Incoming</Heading>
                    <CardSection id="reservations" title="Reservations">
                      <Reservations items={reservations} standalone />
                    </CardSection>
                    <Box marginY="space40"><Separator orientation="horizontal" /></Box>
                    <CardSection id="voiceTasks" title="Voice Tasks">
                      <TasksPanel channel="voice" setAvailable={setAvailable} />
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
                            onClose={(sid) => setChatSessions((prev) => prev.filter((s) => s.sid !== sid))}
                            onIncrementUnread={(sid) =>
                              setChatSessions((prev) =>
                                prev.map((s) => (s.sid === sid ? { ...s, unread: (s.unread || 0) + 1 } : s))
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
                            onPopout={popoutChat}
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
            </TabPanels>
          </Tabs>
        </Box>
      </AgentDesktopShell>
    </Box>
  );
}
