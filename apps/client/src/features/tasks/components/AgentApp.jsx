// src/features/tasks/components/AgentApp.jsx
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
import {
  Modal,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from '@twilio-paste/core/modal';

import Api from '../../index.js';
import { useWorker } from '../hooks/useWorker.js';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';
import { SOFTPHONE_POPUP_FEATURES } from '../../softphone/constants.js';

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
import { useSoftphoneChannel } from '../../softphone/hooks/useSoftphoneChannel.js';

// Si VITE_API_BASE incluye /api, nos quedamos solo con el origen (https://api.contactcenterdev.com)
const apiBaseRaw = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const baseURL = new URL(apiBaseRaw).origin;
const socketBase = import.meta.env.VITE_SOCKET_BASE || baseURL;

const SOFTPHONE_WINDOW_NAME = 'softphone_popup';
const SOFTPHONE_URL = () => `${window.location.origin}?popup=softphone`;

// Handshake timings
const ACK_TIMEOUT_MS = 8000;   // extended to allow slow popup init
const PING_INTERVAL_MS = 500;  // periodic pings during validation
const FIRST_PING_DELAY_MS = 1000; // wait before first ping to let popup mount

export default function AgentApp() {
  const queryClient = useQueryClient();
  const toaster = useToaster();

  const invalidateTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    queryClient.invalidateQueries({ queryKey: ['myTask'] });
  }, [queryClient]);

  const { worker, activity, reservations, setAvailable, sids } = useWorker();
  // ---- Safe worker event helpers (avoid .off which doesn't exist) ----
  const attachWorkerListener = useCallback((eventName, handler) => {
    if (!worker || !eventName || !handler) return;
    if (typeof worker.on === 'function') {
      worker.on(eventName, handler);
    } else if (typeof worker.addListener === 'function') {
      worker.addListener(eventName, handler);
    }
  }, [worker]);

  const detachWorkerListener = useCallback((eventName, handler) => {
    if (!worker || !eventName || !handler) return;
    if (typeof worker.removeListener === 'function') {
      worker.removeListener(eventName, handler);
    } else if (typeof worker.off === 'function') {
      // Some EventEmitter polyfills do offer off; use if present
      worker.off(eventName, handler);
    } else if (typeof worker.removeAllListeners === 'function') {
      // Last resort: drop all listeners for the event (avoid misuse)
      worker.removeAllListeners(eventName);
    }
  }, [worker]);

  // Tabs
  const [mode, setMode] = useLocalStorage('desktop_mode', 'voice');

  // CHAT tabs
  const [chatSessions, setChatSessions] = useState([]);
  const chatJoinedRef = useRef(new Set());
  const joinPendingRef = useRef(new Set());
  const [chatPanelKey, setChatPanelKey] = useState(0);

  const [chatBadge, setChatBadge] = useState(0);
  useEffect(() => { if (mode === 'chat') setChatBadge(0); }, [mode]);

  // ================== Softphone / Popup ==================
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasCall, setHasCall] = useState(false);

  // Initialize directly from localStorage. Accept old string values; always write booleans.
  const [softphonePrefRaw, setSoftphonePref] = useLocalStorage('softphone_popout', false);
  const isSoftphonePopout = softphonePrefRaw === true || softphonePrefRaw === 'true';

  // Briefly disable interactions while verifying an "ON" state after reload.
  const [isSoftphoneValidating, setIsSoftphoneValidating] = useState(false);

  // Window handle lives only for this tab lifetime.
  const softphoneWinRef = useRef(null);

  const prevCallStatusRef = useRef('Idle');
  const lastOpenAttemptRef = useRef(0);

  const awaitingAckRef = useRef(false);
  const ackTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const validationRunRef = useRef(0); // guard token to avoid re-entrancy

  // Distinguish confirm vs. cancel modal close
  const closingByConfirmRef = useRef(false);

  // Reusable channel (BroadcastChannel or storage fallback)
  const { postToChannel } = useSoftphoneChannel({
    isPopup: false,
    onStateUpdate: (payload) => {
      const status = payload?.callStatus || 'Idle';
      setHasCall(status === 'In Call' || status === 'Incoming');
      if (prevCallStatusRef.current !== 'Incoming' && status === 'Incoming') {
        toaster.push({ message: 'Incoming call', variant: 'warning', dismissAfter: 4000 });
      }
      prevCallStatusRef.current = status;

      // ✅ Any inbound state proves the popup is alive — stop validation loop.
      if (awaitingAckRef.current) {
        if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
        if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
        awaitingAckRef.current = false;
        if (!isSoftphonePopout) setSoftphonePref(true);
        setIsSoftphoneValidating(false);
      }
    },
    onPopupClosed: () => {
      softphoneWinRef.current = null;
      setSoftphonePref(false); // keep storage in sync
    },
    onAckReceived: () => {
      // Any 'pong' or 'ready' breaks validation
      if (!awaitingAckRef.current) return;
      if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      awaitingAckRef.current = false;
      // If it was turned ON programmatically by popup, ensure LS reflects ON
      if (!isSoftphonePopout) setSoftphonePref(true);
      setIsSoftphoneValidating(false);
    },
  });

  // Keep a stable reference to the channel function
  const postToChannelRef = useRef(postToChannel);
  useEffect(() => { postToChannelRef.current = postToChannel; }, [postToChannel]);

  const clearValidationTimers = useCallback(() => {
    if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    awaitingAckRef.current = false;
  }, []);

  // Stable probe (no deps) — uses refs so it doesn't retrigger endlessly
  const beginValidationProbe = useCallback(() => {
    // Prevent re-entrancy: if there's a probe running, don't start another
    if (awaitingAckRef.current) return;

    setIsSoftphoneValidating(true);
    awaitingAckRef.current = true;

    const myRun = ++validationRunRef.current; // token for this validation attempt

    // Delay the first ping to give the popup time to mount listeners
    setTimeout(() => {
      if (!awaitingAckRef.current || validationRunRef.current !== myRun) return;
      try { postToChannelRef.current?.('cmd', { action: 'ping' }); } catch { }
      // Continue pinging while we wait
      pingIntervalRef.current = setInterval(() => {
        if (!awaitingAckRef.current || validationRunRef.current !== myRun) return;
        try { postToChannelRef.current?.('cmd', { action: 'ping' }); } catch { }
      }, PING_INTERVAL_MS);
    }, FIRST_PING_DELAY_MS);

    // Global ACK timeout
    ackTimerRef.current = setTimeout(() => {
      if (!awaitingAckRef.current || validationRunRef.current !== myRun) return;
      clearValidationTimers();
      // No ACK — popup isn't alive; flip back to OFF and show inline.
      setSoftphonePref(false);
      setIsSoftphoneValidating(false);
      toaster.push({
        message: 'Softphone popup not detected. Returning inline.',
        variant: 'neutral',
        dismissAfter: 4000,
      });
    }, ACK_TIMEOUT_MS);
  }, []); // intentionally empty deps for stability

  // If stored preference is ON on mount/refresh, verify that a popup is truly alive.
  useEffect(() => {
    if (!isSoftphonePopout) return;
    beginValidationProbe();
    return () => clearValidationTimers();
  }, [isSoftphonePopout]);

  // Safety poll if we *do* have a handle
  useEffect(() => {
    if (!isSoftphonePopout) return;
    const it = setInterval(() => {
      if (softphoneWinRef.current && softphoneWinRef.current.closed) {
        softphoneWinRef.current = null;
        setSoftphonePref(false);
      }
    }, 700);
    return () => clearInterval(it);
  }, [isSoftphonePopout, setSoftphonePref]);

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* Open/close popup (only via user gesture) */
  const openSoftphoneWindow = useCallback(() => {
    const now = Date.now();
    if (now - lastOpenAttemptRef.current < 600) {
      if (softphoneWinRef.current && !softphoneWinRef.current.closed) {
        try { softphoneWinRef.current.focus(); } catch { }
        return softphoneWinRef.current;
      }
    }
    lastOpenAttemptRef.current = now;

    if (softphoneWinRef.current && !softphoneWinRef.current.closed) {
      try { softphoneWinRef.current.focus(); } catch { }
      return softphoneWinRef.current;
    }

    const w = window.open(SOFTPHONE_URL(), SOFTPHONE_WINDOW_NAME, SOFTPHONE_POPUP_FEATURES);
    // Some configs (e.g., noreferrer) can return null even when the popup opens; we do not assume block here.
    if (!w) return null;
    try { w.opener = null; } catch { }
    try { w.focus(); } catch { }
    softphoneWinRef.current = w;
    return w;
  }, []);

  const closeSoftphoneWindow = useCallback(() => {
    // Ask the popup to close itself (works even if handle is lost)
    try { postToChannelRef.current?.('cmd', { action: 'close' }); } catch { }
    try { softphoneWinRef.current?.close(); } catch { }
    softphoneWinRef.current = null;
  }, []);

  /* Confirm flow */
  const proceedOpenPopup = useCallback(() => {
    setConfirmOpen(false);

    // Open or focus the popup
    openSoftphoneWindow();

    // Mark ON and validate; revert if no ACK arrives
    setSoftphonePref(true);
    beginValidationProbe();
  }, [openSoftphoneWindow, setSoftphonePref, beginValidationProbe]);

  const cancelOpenPopup = useCallback(() => {
    setConfirmOpen(false);
    setSoftphonePref(false);
  }, [setSoftphonePref]);

  const handleModalDismiss = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const handleSoftphoneToggle = useCallback((checked) => {
    if (checked) {
      setConfirmOpen(true);
    } else {
      clearValidationTimers();
      closeSoftphoneWindow();
      setSoftphonePref(false);
      setIsSoftphoneValidating(false);
    }
  }, [closeSoftphoneWindow, setSoftphonePref, clearValidationTimers]);

  // ================== CHAT helpers ==================
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
        document
          .getElementById('main-chat-panel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [ensureChatSession, prioritizeChat, setMode]
  );

  // Notificaciones / worker bindings
  const notifiedConvosRef = useRef(new Set());
  const processedTaskCreatedRef = useRef(new Set());

  // Memoize handlers with useCallback
  const onReservationCreated = useCallback(async (r) => {
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
  }, [ensureChatSession, invalidateTasks]);

  const onReservationAccepted = useCallback(async (r) => {
    try {
      const a = r?.task?.attributes || {};
      if (a.channel !== 'chat') return;
      const sid = a.conversationSid || a.conversation_sid;
      const label = a.customerName || a.from || a.name || sid;
      if (sid && !notifiedConvosRef.current.has(sid)) {
        notifiedConvosRef.current.add(sid);
        await ensureChatSession(sid, label);
        toaster.push({
          message: label ? `New chat assigned: ${label}` : 'New chat assigned',
          variant: 'warning',
          dismissAfter: 6000,
        });
      }
      invalidateTasks();
    } catch (e) {
      console.warn('[worker reservation.accepted handler]', e);
    }
  }, [ensureChatSession, invalidateTasks, toaster]);

  const onReservationEvent = useCallback(() => invalidateTasks(), [invalidateTasks]);

  useEffect(() => {
    if (!worker) return;

    attachWorkerListener('reservation.created', onReservationCreated);
    attachWorkerListener('reservation.accepted', onReservationAccepted);

    return () => {
      detachWorkerListener('reservation.created', onReservationCreated);
      detachWorkerListener('reservation.accepted', onReservationAccepted);
    };
  }, [worker, attachWorkerListener, detachWorkerListener, onReservationCreated, onReservationAccepted]);

  useEffect(() => {
    if (!worker) return;

    const evs = [
      'reservation.rejected',
      'reservation.timeout',
      'reservation.canceled',
      'reservation.completed',
      'activity.update',
    ];

    evs.forEach((e) => attachWorkerListener(e, onReservationEvent));

    return () => {
      evs.forEach((e) => detachWorkerListener(e, onReservationEvent));
    };
  }, [worker, attachWorkerListener, detachWorkerListener, onReservationEvent]);

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

    socket.on('connect_error', (err) => console.warn('[socket.io] connect_error', err?.message || err));

    return () => socket.disconnect();
  }, [ensureChatSession, invalidateTasks]);

  const logout = useCallback(async () => {
    await Api.logout();
    try { localStorage.removeItem('agent_ctx'); } catch { }
    try {
      if (sids?.offlineSid) await setAvailable(sids.offlineSid);
    } catch { }
    window.location.reload();
  }, [setAvailable, sids]);

  /* Secciones por modo */
  const voiceSections = useMemo(() => ([
    { id: 'softphone', label: 'Softphone' },
    { id: 'voiceTasks', label: 'Voice Tasks' },
    { id: 'customer360', label: 'Customer 360' },
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
      { label: 'Voice Tasks', targetId: 'voiceTasks' },
      { label: 'Customer 360', targetId: 'customer360' },
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

  // ===== Responsive action bar (stacked on mobile) =====
  const ActionsBar = (
    <Stack
      orientation={['vertical', 'horizontal']}
      spacing="space30"
      alignment="center"
      style={{ flexWrap: 'wrap', width: '100%', maxWidth: 960 }}
    >
      <StatusBar inline label={activity || '—'} onChange={(sid) => setAvailable(sid)} />
      <Switch
        checked={isSoftphonePopout}
        onChange={(e) => handleSoftphoneToggle(e.target.checked)}
        aria-label="Softphone pop-out"
        disabled={isSoftphoneValidating}
      >
        Softphone window {isSoftphoneValidating && '(checking...)'}
      </Switch>
      {hasCall && (
        <Button variant="primary" onClick={() => setControlsOpen(true)} style={{ width: ['100%', 'auto'] }}>Call controls</Button>
      )}
      <Button variant="destructive" onClick={logout} style={{ width: ['100%', 'auto'] }}>Logout</Button>
    </Stack>
  );

  /* Render */
  return (
    <Box height="100%" minHeight="100dvh" width="100%" overflowX="hidden">
      <Toaster {...toaster} />

      {/* Modal de controles de llamada */}
      <CallControlsModal isOpen={controlsOpen} onDismiss={() => setControlsOpen(false)} />

      {/* Modal de confirmación para abrir popup */}
      <Modal
        isOpen={confirmOpen}
        onDismiss={handleModalDismiss}
        size="default"
        ariaLabel="confirm-open-softphone"
      >
        <ModalHeader>
          <ModalHeading>Open softphone in a new window?</ModalHeading>
        </ModalHeader>
        <ModalBody>
          The softphone will move to a separate popup window. You can switch it off later to bring it back inline.
        </ModalBody>
        <ModalFooter>
          <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={cancelOpenPopup} style={{ width: ['100%', 'auto'] }}>Cancel</Button>
            <Button variant="primary" onClick={proceedOpenPopup} style={{ width: ['100%', 'auto'] }}>Open window</Button>
          </Stack>
        </ModalFooter>
      </Modal>

      <AgentDesktopShell
        sections={mode === 'voice' ? voiceSections : mode === 'chat' ? chatSections : supervisorSections}
        title="Agent Desktop"
        mode={mode}
        quickActions={shellQuickActions}
        actions={ActionsBar}
      >
        {/* Sticky Tabs for mobile */}
        <Box position="sticky" top={0} zIndex="zIndex80" backgroundColor="colorBackground" paddingY="space40">
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
                <Box style={{ margin: '0 auto', maxWidth: 960 }} paddingX={['space20','space0']}>
                  <Stack orientation="vertical" spacing="space70">
                    {/* Sección 1: Softphone (inline si no popup) */}
                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">
                        Active Call Handling
                      </Heading>
                      <CardSection id="softphone" title="Softphone">
                        {/* OFF → inline visible; ON → inline hidden (hook still mounted in main) */}
                        <Box display={isSoftphonePopout ? 'none' : 'block'}>
                          <Softphone popupOpen={isSoftphonePopout} />
                        </Box>
                      </CardSection>
                    </Box>

                    <Separator orientation="horizontal" />

                    {/* Sección 2: Voice Tasks (antes que 360 para flujo más natural en mobile) */}
                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">Voice Tasks</Heading>
                      <CardSection id="voiceTasks" title="Voice Tasks">
                        <TasksPanel channel="voice" setAvailable={setAvailable} />
                      </CardSection>
                    </Box>

                    <Separator orientation="horizontal" />

                    {/* Sección 3: Customer 360 */}
                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">Customer 360</Heading>
                      <CardSection id="customer360" title="Customer 360">
                        <Customer360 />
                      </CardSection>
                    </Box>
                  </Stack>
                </Box>
              </TabPanel>

              {/* CHAT */}
              <TabPanel id="chat">
                <Box style={{ margin: '0 auto', maxWidth: 960 }} paddingX={['space20','space0']}>
                  <Stack orientation="vertical" spacing="space70">
                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">Active Conversations</Heading>
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
                            <Box color="colorTextWeak" textAlign="center">No active chats</Box>
                          )}
                        </Box>
                      </CardSection>
                    </Box>

                    <Separator orientation="horizontal" />

                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">Tasks & Customer Info</Heading>
                      <CardSection id="chatTasks" title="Chat Tasks">
                        <TasksPanel channel="chat" onOpenChat={selectChatFromTasks} />
                      </CardSection>
                      <Box marginY="space40"><Separator orientation="horizontal" /></Box>
                      <CardSection id="customer360-chat" title="Customer 360">
                        <Customer360 />
                      </CardSection>
                    </Box>
                  </Stack>
                </Box>
              </TabPanel>

              {/* SUPERVISOR */}
              <TabPanel id="supervisor">
                <Box style={{ margin: '0 auto', maxWidth: 960 }} paddingX={['space20','space0']}>
                  <Stack orientation="vertical" spacing="space70">
                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">Tasks & Incoming</Heading>
                      <CardSection id="reservations" title="Reservations">
                        <Reservations items={reservations} standalone />
                      </CardSection>
                    </Box>

                    <Separator orientation="horizontal" />

                    <Box>
                      <Heading as="h2" variant="heading30" marginBottom="space40" textAlign="center">Team Presence</Heading>
                      <CardSection id="presence" title="Presence">
                        <Presence />
                      </CardSection>
                    </Box>
                  </Stack>
                </Box>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </AgentDesktopShell>
    </Box>
  );
}
