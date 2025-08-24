import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import Api from '../../index.js';
import http from '../../../shared/services/http.js';
import { getCallSid } from '../../softphone/services/callSidStore.js';

import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Heading } from '@twilio-paste/core/heading';
import { Button } from '@twilio-paste/core/button';
import { Card } from '@twilio-paste/core/card';
import { Badge } from '@twilio-paste/core/badge';
import { Separator } from '@twilio-paste/core/separator';
import {
  Modal,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter
} from '@twilio-paste/core/modal';
import { Select, Option } from '@twilio-paste/core/select';
import { Label } from '@twilio-paste/core/label';
import { Input } from '@twilio-paste/core/input';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Toaster, useToaster } from '@twilio-paste/core/toast';
import { RadioGroup, Radio } from '@twilio-paste/core/radio-group';

/**
 * TasksPanel — app-like, no inner scrolls
 * Responsive polish:
 * - Static grid templates
 * - Avoid long IDs blowing layout
 * - Mobile buttons full-width where it helps
 */
export default function TasksPanel({ onFinished, setAvailable, channel = 'voice', onOpenChat }) {
  const voiceMode = channel !== 'chat';
  const { t: translate } = useTranslation();
  const toaster = useToaster();

  // Data
  const { data: itemsRaw = [], isLoading: loading, refetch: load } = useQuery({
    queryKey: ['myTasks'],
    queryFn: () => Api.myTasks('wrapping,assigned,reserved'),
    staleTime: 10000,
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // o 0 si no quieres polling
    onError: () =>
      toaster.push({
        message: translate('tasksLoadError') || 'Failed to load tasks.',
        variant: 'error'
      }),
  });

  // Split by channel
  const voiceTasks = useMemo(
    () => itemsRaw.filter((t) => (t?.attributes?.channel || 'voice') !== 'chat'),
    [itemsRaw]
  );
  const chatTasks = useMemo(
    () => itemsRaw.filter((t) => (t?.attributes?.channel || '') === 'chat'),
    [itemsRaw]
  );
  const items = voiceMode ? voiceTasks : chatTasks;

  /* =========================================================
   * Conversation state cache (sid -> { state, closed, participantsCount })
   * ========================================================= */
  const [convStates, setConvStates] = useState({}); // { [sid]: { state, closed, participantsCount } }

  const fetchConvState = useCallback(async (sid) => {
    try {
      const r = await http.get(`/conversations/${sid}/state`);
      return r.data;
    } catch {
      return { sid, state: 'unknown', closed: false, participantsCount: undefined };
    }
  }, []);

  const refreshConvStates = useCallback(async (taskList) => {
    const sids = [...new Set(
      (taskList || [])
        .map((t) => t?.attributes?.conversationSid || t?.attributes?.conversation_sid)
        .filter(Boolean)
    )];
    if (!sids.length) return;

    const results = await Promise.all(sids.map(fetchConvState));
    setConvStates((prev) => {
      const next = { ...prev };
      for (const it of results) {
        next[it.sid] = { state: it.state, closed: !!it.closed, participantsCount: it.participantsCount };
      }
      return next;
    });
  }, [fetchConvState]);

  useEffect(() => { refreshConvStates(chatTasks); }, [chatTasks, refreshConvStates]);

  // Poll cada 5s mientras haya chats
  useEffect(() => {
    if (!chatTasks.length) return;
    const it = setInterval(() => refreshConvStates(chatTasks), 5000);
    return () => clearInterval(it);
  }, [chatTasks, refreshConvStates]);

  /* =========================
   * Wrap-up (chat)
   * ========================= */
  const [openChatWrap, setOpenChatWrap] = useState(false);
  const [chatWrapTask, setChatWrapTask] = useState(null);
  const [chatWrapDisposition, setChatWrapDisposition] = useState('Resolved');
  const [chatWrapNotes, setChatWrapNotes] = useState('');

  // Si chat está abierto y se intenta completar → popup para cerrar primero
  const [confirmCloseFirst, setConfirmCloseFirst] = useState(null); // { task, convoSid }

  const attemptCompleteChat = (t) => {
    const a = t?.attributes || {};
    const convoSid = a.conversationSid || a.conversation_sid || '';
    const cs = convStates[convoSid] || {};
    const convState = String(cs.state || '').toLowerCase();
    const ended = cs.closed === true || convState === 'closed' || convState === 'inactive';
    const noParticipants = typeof cs.participantsCount === 'number' && cs.participantsCount === 0;
    const isWrapping = String(t?.assignmentStatus || '').toLowerCase() === 'wrapping';
    if (!convoSid) return;

    // Si no está cerrado NI inactivo NI wrapping y aún hay participantes → pedir cerrar primero
    if (!ended && !isWrapping && !noParticipants) {
      setConfirmCloseFirst({ task: t, convoSid });
      return;
    }
    // Condición suficiente para wrap: ended || wrapping || sin participantes
    setChatWrapTask(t);
    setChatWrapDisposition('Resolved');
    setChatWrapNotes('Chat wrap-up');
    setOpenChatWrap(true);
  };

  async function doChatFinish() {
    if (!chatWrapTask) {
      setOpenChatWrap(false);
      return;
    }

    const reason = (chatWrapNotes || '').trim() || 'Chat wrap-up';
    const disposition = chatWrapDisposition || 'Resolved';
    const taskSid = chatWrapTask.sid;

    try {
      // Log CRM (best-effort)
      try {
        await Api.crmLogInteraction?.({
          customerId: chatWrapTask.attributes?.customerId || null,
          channel: 'chat',
          intent: chatWrapTask.attributes?.intent || null,
          taskSid,
          conversationSid:
            chatWrapTask.attributes?.conversationSid ||
            chatWrapTask.attributes?.conversation_sid ||
            null,
          disposition,
          notes: reason,
        });
      } catch (e) {
        console.warn('logInteraction (chat) failed', e?.message || e);
      }

      // autoWrap permite completar incluso si el Task aún estaba en assigned
      await Api.completeTask(taskSid, { reason, disposition, autoWrap: true });

      setOpenChatWrap(false);
      await load();
      onFinished?.(taskSid);
      toaster.push({
        message: translate('completeTaskSuccess') || 'Task completed',
        variant: 'success',
        dismissAfter: 3000,
      });
    } catch (e) {
      console.error('finishChatTask error', e);
      toaster.push({
        message: e?.response?.data?.error || translate('completeTaskError') || 'Failed to complete task.',
        variant: 'error',
      });
    }
  }

  /* =========================
   * Transfer (voice)
   * ========================= */
  const [openTransfer, setOpenTransfer] = useState(false);
  const [transferTask, setTransferTask] = useState(null);
  const [agents, setAgents] = useState([]);
  const [transferMode, setTransferMode] = useState('Agent'); // 'Agent' | 'External'
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('');
  const [externalNumber, setExternalNumber] = useState('');

  const filteredAgents = useMemo(
    () => agents.filter((a) => a.friendlyName.toLowerCase().includes(search.toLowerCase())),
    [agents, search]
  );

  async function loadAgents() {
    try {
      const list = await Api.availableWorkers();
      setAgents((list || []).filter((a) => !!a.contactUri));
    } catch {
      setAgents([]);
      toaster.push({ message: translate('agentsLoadError') || 'Failed to load agents.', variant: 'error' });
    }
  }

  function onTransfer(task) {
    setTransferTask(task);
    setTransferMode('Agent');
    setSearch('');
    setTarget('');
    setExternalNumber('');
    setOpenTransfer(true);
    loadAgents();
  }

  async function doCold() {
    const cSid = transferTask?.attributes?.callSid || transferTask?.attributes?.call_sid;
    const agentCallSid = getCallSid() || undefined;
    const transferTarget = transferMode === 'Agent' ? target : externalNumber;
    if (!cSid || !transferTarget) {
      toaster.push({ message: translate('transferMissingData') || 'Missing data for transfer.', variant: 'error' });
      return;
    }
    try {
      await Api.transferCold({ customerCallSid: cSid, targetIdentity: transferTarget, agentCallSid });
      setOpenTransfer(false);
      toaster.push({ message: translate('transferSuccess') || 'Transfer successful', variant: 'success', dismissAfter: 3000 });
      await load();
    } catch (e) {
      console.error('transfer cold error', e);
      toaster.push({ message: translate('transferError') || 'Failed to transfer.', variant: 'error' });
    }
  }

  async function doWarm() {
    const cSid = transferTask?.attributes?.callSid || transferTask?.attributes?.call_sid;
    const agentCallSid = getCallSid();
    const transferTarget = transferMode === 'Agent' ? target : externalNumber;
    if (!cSid || !agentCallSid || !transferTarget) {
      toaster.push({ message: translate('warmTransferMissingData') || 'Missing data for warm transfer.', variant: 'error' });
      return;
    }
    try {
      await Api.transferWarm({
        taskSid: transferTask?.sid,
        customerCallSid: cSid,
        agentCallSid,
        targetIdentity: transferTarget
      });
      setOpenTransfer(false);
      toaster.push({ message: translate('transferSuccess') || 'Transfer successful', variant: 'success', dismissAfter: 3000 });
    } catch (e) {
      console.error('transfer warm error', e);
      toaster.push({ message: translate('warmTransferError') || 'Failed to initiate warm transfer.', variant: 'error' });
    }
  }

  async function doCompleteTransfer() {
    const agentCallSid = getCallSid();
    if (!agentCallSid) {
      toaster.push({ message: translate('noActiveCall') || 'No active call', variant: 'error' });
      return;
    }
    try {
      await Api.transferComplete(agentCallSid);
      await load();
      toaster.push({ message: translate('transferSuccess') || 'Transfer successful', variant: 'success', dismissAfter: 3000 });
    } catch (e) {
      console.error('transfer complete error', e);
      toaster.push({ message: translate('completeTransferError') || 'Failed to complete transfer.', variant: 'error' });
    }
  }

  /* =========================
   * Wrap-up (voice)
   * ========================= */
  const [openWrap, setOpenWrap] = useState(false);
  const [wrapTask, setWrapTask] = useState(null);
  const [wrapDisposition, setWrapDisposition] = useState('Resolved');
  const [wrapNotes, setWrapNotes] = useState('');

  function onFinishPress(t) {
    const dur = t.age || 0;
    setWrapTask(t);
    setWrapDisposition('Resolved');
    setWrapNotes(`Call duration: ${Math.max(0, dur)}s`);
    setOpenWrap(true);
  }

  async function doFinish() {
    if (!wrapTask) return setOpenWrap(false);
    try {
      try {
        await Api.crmLogInteraction?.({
          customerId: wrapTask.attributes?.customerId || null,
          channel: 'voice',
          intent: wrapTask.attributes?.intent || null,
          taskSid: wrapTask.sid,
          callSid: wrapTask.attributes?.callSid || wrapTask.attributes?.call_sid || null,
          disposition: wrapDisposition,
          notes: wrapNotes
        });
      } catch (e) {
        console.warn('logInteraction failed (non-blocking)', e?.message || e);
      }

      await Api.completeTask(wrapTask.sid, { reason: wrapNotes, disposition: wrapDisposition });
      setOpenWrap(false);
      await load();
      onFinished?.(wrapTask.sid);
      toaster.push({ message: translate('completeTaskSuccess') || 'Task completed', variant: 'success', dismissAfter: 3000 });
    } catch (e) {
      console.error('finishTask error', e);
      toaster.push({ message: translate('completeTaskError') || 'Failed to complete task.', variant: 'error' });
    }
  }

  /* =========================
   * Chat actions
   * ========================= */
  async function closeChat(conversationSid) {
    try {
      await http.post(`/conversations/${conversationSid}/close`, { removeParticipants: true });
      toaster.push({ message: 'Chat closed', variant: 'success', dismissAfter: 2000 });
      await refreshConvStates(chatTasks); // refrescar estado
      await load();
    } catch (e) {
      console.error('close chat error', e);
      try {
        await http.post(`/conversations/${conversationSid}/timers`, { inactive: 'PT0S', closed: 'PT0S' });
        toaster.push({ message: 'Chat close requested', variant: 'success', dismissAfter: 2000 });
        await refreshConvStates(chatTasks);
        await load();
      } catch (e2) {
        toaster.push({ message: 'Failed to close chat', variant: 'error' });
      }
    }
  }

  // ===== Grid templates (static strings) =====
  const gridColsChat = 'repeat(auto-fit, minmax(320px, 1fr))';
  const gridColsVoice = 'repeat(auto-fit, minmax(340px, 1fr))';

  function statusToVariant(s) {
    const v = String(s || '').toLowerCase();
    if (v === 'wrapping') return 'warning';
    if (v === 'assigned' || v === 'reserved') return 'new';
    if (v === 'completed' || v === 'closed') return 'success';
    return 'neutral';
  }

  /* =========================
   * Render — CHAT (cards)
   * ========================= */
  if (!voiceMode) {
    return (
      <Box
        display="grid"
        gridTemplateRows="auto auto 1fr"
        gap="space50"
        height="100%"
        minHeight="0"
        backgroundColor="colorBackground"
        borderRadius="borderRadius30"
        boxShadow="shadow"
        padding="space70"
      >
        <Toaster {...toaster} />
        <Stack
          orientation={['vertical', 'horizontal']}
          spacing="space50"
          alignment="center"
          distribution="spaceBetween"
          style={{ flexWrap: 'wrap' }}
        >
          <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Heading as="h3" variant="heading30" margin="space0">Chat Tasks</Heading>
            <Badge as="span" variant="neutral">{chatTasks.length}</Badge>
          </Stack>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </Stack>

        <Separator orientation="horizontal" />

        {loading ? (
          <SkeletonLoader />
        ) : !chatTasks.length ? (
          <Box color="colorTextWeak">No chat tasks</Box>
        ) : (
          <Box display="grid" gridTemplateColumns={gridColsChat} gap="space60">
            {chatTasks.map((t) => {
              const a = t.attributes || {};
              const convoSid = a.conversationSid || a.conversation_sid || '';
              const cs = convStates[convoSid] || {};
              const convState = String(cs.state || '').toLowerCase();
              const ended = cs.closed === true || convState === 'closed' || convState === 'inactive';
              const noParticipants = typeof cs.participantsCount === 'number' && cs.participantsCount === 0;
              const isWrapping = String(t.assignmentStatus || '').toLowerCase() === 'wrapping';
              const showComplete = ended || isWrapping || noParticipants;

              return (
                <Card key={t.sid} padding="space70">
                  <Stack orientation="vertical" spacing="space50">
                    <Stack orientation={['vertical', 'horizontal']} spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
                      <Box flexGrow={1} minWidth="0" width="100%">
                        <Heading
                          as="h4"
                          variant="heading40"
                          margin="space0"
                          style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', lineHeight: 1.25 }}
                          title={t.sid}
                        >
                          {t.sid}
                        </Heading>
                      </Box>
                      <Badge as="span" variant={ended ? 'neutral' : statusToVariant(t.assignmentStatus)}>
                        {ended ? 'closed' : (t.assignmentStatus || 'assigned')}
                      </Badge>
                    </Stack>

                    <Box color="colorTextWeak" fontSize="fontSize30">
                      Conversation: <b style={{ wordBreak: 'break-all' }}>{convoSid || '—'}</b>
                      {typeof cs.participantsCount === 'number' ? (
                        <span style={{ marginLeft: 8, opacity: 0.7 }}>
                          · participants: {cs.participantsCount}
                        </span>
                      ) : null}
                      {(!ended && isWrapping) ? (
                        <span style={{ marginLeft: 8, opacity: 0.7 }}>
                          · task: wrapping
                        </span>
                      ) : null}
                    </Box>

                    {/* Smart buttons */}
                    {!showComplete ? (
                      <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
                        <Button variant="secondary" size="small" onClick={() => onOpenChat?.(convoSid)} disabled={!convoSid}>Open chat</Button>
                        <Button variant="destructive" size="small" onClick={() => closeChat(convoSid)} disabled={!convoSid}>Close chat</Button>
                      </Stack>
                    ) : (
                      <Button variant="primary" size="small" onClick={() => attemptCompleteChat(t)}>
                        {translate('completeTask') || 'Complete task'}
                      </Button>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Box>
        )}

        {/* Modal: Wrap-up de CHAT */}
        <Modal isOpen={openChatWrap} onDismiss={() => setOpenChatWrap(false)} ariaLabel="wrapup-chat-task" size="default">
          <ModalHeader>
            <ModalHeading>{translate('completeTask') || 'Complete task'}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <Stack orientation="vertical" spacing="space60">
              <Box>
                <Label htmlFor="chat-dispo">{translate('disposition') || 'Disposition'}</Label>
                <Select id="chat-dispo" value={chatWrapDisposition} onChange={(e) => setChatWrapDisposition(e.target.value)}>
                  {['Resolved', 'Escalated', 'Callback scheduled', 'Voicemail left', 'No answer', 'Wrong number']
                    .map((d) => (
                      <Option key={`chat-${d}`} value={d}>{d}</Option>
                    ))}
                </Select>
              </Box>
              <Box>
                <Label htmlFor="chat-notes">{translate('notesReason') || 'Notes'}</Label>
                <Input id="chat-notes" value={chatWrapNotes} onChange={(e) => setChatWrapNotes(e.target.value)} placeholder={translate('shortNotesPlaceholder') || 'Short wrap-up notes...'} />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setOpenChatWrap(false)}>{translate('cancel') || 'Cancel'}</Button>
              <Button variant="primary" onClick={doChatFinish}>{translate('complete') || 'Complete'}</Button>
            </Stack>
          </ModalFooter>
        </Modal>

        {/* Modal: pedir cerrar primero si el chat sigue abierto */}
        <Modal isOpen={!!confirmCloseFirst} onDismiss={() => setConfirmCloseFirst(null)} ariaLabel="close-chat-first" size="default">
          <ModalHeader>
            <ModalHeading>Close chat to wrap up</ModalHeading>
          </ModalHeader>
          <ModalBody>
            You need to close the conversation before completing the task.
          </ModalBody>
          <ModalFooter>
            <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setConfirmCloseFirst(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const { convoSid, task } = confirmCloseFirst || {};
                  setConfirmCloseFirst(null);
                  if (convoSid) await closeChat(convoSid);
                  if (task) {
                    setChatWrapTask(task);
                    setChatWrapDisposition('Resolved');
                    setChatWrapNotes('Chat wrap-up');
                    setOpenChatWrap(true);
                  }
                }}
              >
                Close chat now
              </Button>
            </Stack>
          </ModalFooter>
        </Modal>
      </Box>
    );
  }

  /* =========================
   * Render — VOICE
   * ========================= */
  const avgSLA = items.length > 0
    ? Math.round(items.reduce((sum, t) => sum + (t.age || 0), 0) / items.length)
    : 0;

  return (
    <Box
      display="grid"
      gridTemplateRows="auto auto 1fr"
      gap="space50"
      height="100%"
      minHeight="0"
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
    >
      <Toaster {...toaster} />

      <Stack
        orientation={['vertical', 'horizontal']}
        spacing="space40"
        alignment="center"
        distribution="spaceBetween"
        style={{ flexWrap: 'wrap' }}
      >
        <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Heading as="h3" variant="heading30" margin="space0">
            {translate('myTasks') || 'My Tasks'}
          </Heading>
          <Badge as="span" variant="neutral">{items.length}</Badge>
          <Badge as="span">Avg SLA: {avgSLA}s</Badge>
        </Stack>

        <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap', width: '100%' }}>
          <Box width={['100%', 'auto']}>
            <Button aria-label={translate('refreshAria') || 'Refresh'} onClick={load} disabled={loading} variant="secondary" style={{ width: '100%' }}>
              {loading ? translate('loading') || 'Loading…' : translate('refresh') || 'Refresh'}
            </Button>
          </Box>
          <Box width={['100%', 'auto']}>
            <Button
              aria-label={translate('completeTransferAria') || 'Complete transfer'}
              variant="destructive"
              onClick={doCompleteTransfer}
              disabled={!getCallSid()}
              style={{ width: '100%' }}
            >
              {translate('completeTransfer') || 'Complete transfer'}
            </Button>
          </Box>
        </Stack>
      </Stack>

      <Separator orientation="horizontal" />

      {loading ? (
        <SkeletonLoader />
      ) : !items.length ? (
        <Card padding="space70">
          <Stack orientation={['vertical', 'horizontal']} spacing="space60" alignment="center" distribution="spaceBetween">
            <Box>
              <Heading as="h4" variant="heading40" margin="space0">{translate('noTasks') || 'No tasks'}</Heading>
              <Box color="colorTextWeak">{translate('noTasksHint') || 'When calls arrive they will appear here.'}</Box>
            </Box>
            <Box width={['100%', 'auto']}>
              <Button variant="secondary" onClick={load} style={{ width: '100%' }}>{translate('refresh') || 'Refresh'}</Button>
            </Box>
          </Stack>
        </Card>
      ) : (
        <Box display="grid" gridTemplateColumns={gridColsVoice} gap="space60">
          {items.map((t) => (
            <VoiceTaskCard key={t.sid} t={t} onFinishPress={(task) => {
              setWrapTask(task);
              setWrapDisposition('Resolved');
              setWrapNotes(`Call duration: ${Math.max(0, task.age || 0)}s`);
              setOpenWrap(true);
            }} onTransfer={onTransfer} />
          ))}
        </Box>
      )}

      {/* Transfer modal */}
      <Modal isOpen={openTransfer} onDismiss={() => setOpenTransfer(false)} size="default">
        <ModalHeader>
          <ModalHeading>{translate('transferCall') || 'Transfer call'}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation="vertical" spacing="space60">
            <RadioGroup
              name="transferMode"
              value={transferMode}
              legend={translate('transferMode') || 'Transfer mode'}
              onChange={(v) => setTransferMode(v)}
            >
              <Radio id="tm-agent" value="Agent">{translate('agent') || 'Agent'}</Radio>
              <Radio id="tm-external" value="External">{translate('external') || 'External'}</Radio>
            </RadioGroup>

            {transferMode === 'Agent' ? (
              <Stack orientation="vertical" spacing="space50">
                <Label htmlFor="searchAgents">{translate('searchAgents') || 'Search agents'}</Label>
                <Input id="searchAgents" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
                <Label htmlFor="agentDest">{translate('agentDestination') || 'Agent destination'}</Label>
                <Select id="agentDest" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <Option value="">{translate('chooseAgent') || 'Choose an available agent…'}</Option>
                  {filteredAgents.map((a) => (
                    <Option key={a.workerSid} value={a.contactUri}>
                      {a.friendlyName} · {a.contactUri}
                    </Option>
                  ))}
                </Select>
              </Stack>
            ) : (
              <Stack orientation="vertical" spacing="space50">
                <Label htmlFor="ext">{translate('enterPhone') || 'Enter phone number'}</Label>
                <Input id="ext" value={externalNumber} onChange={(e) => setExternalNumber(e.target.value)} placeholder="+1…" />
              </Stack>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setOpenTransfer(false)}>{translate('cancel') || 'Cancel'}</Button>
            <Button variant="secondary" onClick={doCold}>{translate('coldTransfer') || 'Cold transfer'}</Button>
            <Button variant="primary" onClick={doWarm}>{translate('warmTransfer') || 'Warm transfer'}</Button>
          </Stack>
        </ModalFooter>
      </Modal>

      {/* Wrap-up modal (voice) */}
      <Modal isOpen={openWrap} onDismiss={() => setOpenWrap(false)} ariaLabel="wrapup-task" size="default">
        <ModalHeader>
          <ModalHeading>{translate('completeTask') || 'Complete task'}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation="vertical" spacing="space60">
            <Box>
              <Label htmlFor="dispo">{translate('disposition') || 'Disposition'}</Label>
              <Select id="dispo" value={wrapDisposition} onChange={(e) => setWrapDisposition(e.target.value)}>
                {['Resolved', 'Escalated', 'Callback scheduled', 'Voicemail left', 'No answer', 'Wrong number'].map((d) => (
                  <Option key={d} value={d}>{d}</Option>
                ))}
              </Select>
            </Box>
            <Box>
              <Label htmlFor="notes">{translate('notesReason') || 'Notes'}</Label>
              <Input id="notes" value={wrapNotes} onChange={(e) => setWrapNotes(e.target.value)} placeholder="Short notes..." />
            </Box>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setOpenWrap(false)}>{translate('cancel') || 'Cancel'}</Button>
            <Button variant="primary" onClick={doFinish}>{translate('complete') || 'Complete'}</Button>
          </Stack>
        </ModalFooter>
      </Modal>
    </Box>
  );
}

/* ===== Voice Card ===== */
function VoiceTaskCard({ t, onFinishPress, onTransfer }) {
  const status = String(t.assignmentStatus || '').toLowerCase();
  const canFinish = status === 'wrapping';
  const customerCallSid = t.attributes?.callSid || t.attributes?.call_sid || null;

  const variant =
    status === 'wrapping'
      ? 'warning'
      : (status === 'assigned' || status === 'reserved')
        ? 'new'
        : 'neutral';

  return (
    <Card padding="space70">
      <Stack orientation="vertical" spacing="space50">
        <Stack orientation={['vertical', 'horizontal']} spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
          <Box flexGrow={1} minWidth="0" width="100%">
            <Heading
              as="h4"
              variant="heading40"
              margin="space0"
              style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', lineHeight: 1.25 }}
              title={t.sid}
            >
              {t.sid}
            </Heading>
          </Box>
          <Badge as="span" variant={variant}>{t.assignmentStatus}</Badge>
        </Stack>

        {customerCallSid ? (
          <Box color="colorTextWeak" fontSize="fontSize30">
            CallSid: <b style={{ wordBreak: 'break-all' }}>{customerCallSid}</b>
          </Box>
        ) : null}

        <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => onTransfer(t)} disabled={!customerCallSid}>Transfer</Button>
          <Button variant="primary" onClick={() => onFinishPress(t)} disabled={!canFinish}>Finish</Button>
        </Stack>
      </Stack>
    </Card>
  );
}
