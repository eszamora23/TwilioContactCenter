// contact-center/client/src/components/TasksPanel.jsx
import { useEffect, useMemo, useState } from 'react';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { useQuery } from '@tanstack/react-query';
import Api from '../services/index.js';
import http from '../services/http.js';
import { useTranslation } from 'react-i18next';

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
import { AlertDialog } from '@twilio-paste/core/alert-dialog';
import { SkeletonLoader } from '@twilio-paste/core/skeleton-loader';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@twilio-paste/core/tabs';
import { RadioGroup, Radio } from '@twilio-paste/core/radio-group';
import { Toaster, useToaster } from '@twilio-paste/core/toast';
import { Tooltip } from '@twilio-paste/core/tooltip';
import { getCallSid } from '../softphone/callSidStore.js';

/* =========================
 *   Constantes y helpers
 * ========================= */

const DISPOSITIONS = [
  'Resolved',
  'Escalated',
  'Callback scheduled',
  'Voicemail left',
  'No answer',
  'Wrong number'
];

const SLA_SECONDS = Number(import.meta.env.VITE_SLA_SECONDS || 45);

const DISPO_SUGGESTIONS = {
  finance_balance: 'Resolved Payment Inquiry'
};

function formatMMSS(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* =========================
 *   UI: Acordeón simple
 * ========================= */

function Accordion({ children }) {
  return <Stack orientation="vertical" spacing="space40">{children}</Stack>;
}

function AccordionItem({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button variant="link" onClick={() => setOpen((o) => !o)}>{title}</Button>
      {open && <Box marginTop="space30">{children}</Box>}
    </Box>
  );
}

/* =========================
 *   UI: Tarjeta de tarea
 * ========================= */

function TaskCard({
  t,
  onFinishPress,
  onTransfer,
  onHold,
  onUnhold,
  onRecCtrl,
  holdStates,
  recStatus
}) {
  const { t: translate } = useTranslation();
  const canFinish = String(t.assignmentStatus).toLowerCase() === 'wrapping';
  const customerCallSid = t.attributes?.callSid || t.attributes?.call_sid || null;

  const firstResDate = useMemo(() => {
    const ds = (t.reservations || [])
      .map((r) => new Date(r.dateCreated))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    return ds ? ds.getTime() : null;
  }, [t.reservations]);

  const [queueSec, setQueueSec] = useState(
    firstResDate ? Math.max(0, Math.floor((Date.now() - firstResDate) / 1000)) : t.age || 0
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setQueueSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const slaLeft = Math.max(0, SLA_SECONDS - queueSec);
  const slaVariant = slaLeft === 0 ? 'destructive' : slaLeft <= SLA_SECONDS * 0.2 ? 'warning' : 'new';
  const cardBg = slaLeft <= 0 ? 'colorBackgroundErrorLight' : undefined;

  // Notificación una sola vez si incumple (simple guard con data-flag en DOM)
  useEffect(() => {
    if (slaLeft <= 0) {
      const el = document.getElementById(`task-${t.sid}-sla-flag`);
      if (el && !el.dataset.notified) {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(translate('slaBreachedNotification', { taskSid: t.sid }));
          }
          el.dataset.notified = '1';
        });
      }
    }
  }, [slaLeft, t.sid, translate]);

  const isHeld = !!holdStates[t.sid];
  const holdElapsed = isHeld ? Math.floor((Date.now() - holdStates[t.sid].start) / 1000) : 0;
  const currentRecStatus = recStatus || 'inactive';

  return (
    <Card padding="space70" backgroundColor={cardBg} id={`task-${t.sid}-sla-flag`}>
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
          }
          .tp__pulsing { animation: pulse 1.5s ease-in-out infinite; }
        `}
      </style>

      <Stack orientation="vertical" spacing="space50">
        {/* Header uniforme */}
        <Stack
          orientation={['vertical', 'horizontal']}
          spacing="space40"
          alignment="center"
          style={{ flexWrap: 'wrap' }}
        >
          <Heading as="h4" variant="heading40" margin="space0">
            {t.sid}
          </Heading>

          <Stack orientation="horizontal" spacing="space30" style={{ flexWrap: 'wrap' }}>
            <Badge as="span" variant={canFinish ? 'warning' : 'neutral'}>
              {t.assignmentStatus}
            </Badge>
            <Badge as="span" variant={slaVariant} title={`SLA ${SLA_SECONDS}s`}>
              SLA: {formatMMSS(queueSec)} / {formatMMSS(SLA_SECONDS)}
            </Badge>
          </Stack>
        </Stack>

        {/* Meta */}
        {customerCallSid ? (
          <Box color="colorTextWeak" fontSize="fontSize30">
            {translate('customerCallSid')}: {customerCallSid}
          </Box>
        ) : null}

        {t.reservations?.length ? (
          <Box color="colorTextWeak" fontSize="fontSize30">
            {translate('reservations')}: {t.reservations.map((r) => `${r.sid} (${r.reservationStatus})`).join(', ')}
          </Box>
        ) : null}

        <Separator orientation="horizontal" />

        {/* Acciones en acordeón */}
        <Accordion>
          {/* Call control */}
          <AccordionItem title={translate('callControl')}>
            <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
              <Tooltip text={translate('finishTaskTooltip')}>
                <Button
                  aria-label={translate('finishTaskAria')}
                  variant="primary"
                  onClick={() => onFinishPress(t)}
                  disabled={!canFinish}
                >
                  {translate('finishTask')}
                </Button>
              </Tooltip>

              <Tooltip text={translate('holdTooltip')}>
                <Button
                  aria-label={translate('holdAria')}
                  variant="secondary"
                  onClick={() => onHold(t)}
                  disabled={!customerCallSid}
                  className={isHeld ? 'tp__pulsing' : ''}
                >
                  {translate('hold')}
                  {isHeld && (
                    <Badge as="span" marginLeft="space30">
                      {translate('holdDuration', { seconds: holdElapsed })}
                    </Badge>
                  )}
                </Button>
              </Tooltip>

              <Tooltip text={translate('resumeTooltip')}>
                <Button
                  aria-label={translate('resumeAria')}
                  variant="secondary"
                  onClick={() => onUnhold(t)}
                  disabled={!customerCallSid}
                >
                  {translate('resume')}
                </Button>
              </Tooltip>
            </Stack>
          </AccordionItem>

          {/* Transfer */}
          <AccordionItem title={translate('transfer')}>
            <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
              <Tooltip text={translate('transferTooltip')}>
                <Button
                  aria-label={translate('transferAria')}
                  variant="secondary"
                  onClick={() => onTransfer(t)}
                  disabled={!customerCallSid}
                >
                  {translate('transfer')}
                </Button>
              </Tooltip>
            </Stack>
          </AccordionItem>

          {/* Recording */}
          <AccordionItem title={translate('recording')}>
            <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
              <Tooltip text={translate('ensureConsent')}>
                <Badge as="span" variant="error">
                  {translate('recording')}: {currentRecStatus}
                </Badge>
              </Tooltip>

              <Tooltip text={translate('startRecTooltip')}>
                <Button
                  aria-label={translate('startRecAria')}
                  variant="secondary"
                  onClick={() => onRecCtrl('start')}
                  disabled={currentRecStatus !== 'inactive'}
                >
                  Rec ⏺
                </Button>
              </Tooltip>

              <Tooltip text={translate('pauseRecTooltip')}>
                <Button
                  aria-label={translate('pauseRecAria')}
                  variant="secondary"
                  onClick={() => onRecCtrl('pause')}
                  disabled={currentRecStatus !== 'active'}
                >
                  Rec ⏸
                </Button>
              </Tooltip>

              <Tooltip text={translate('resumeRecTooltip')}>
                <Button
                  aria-label={translate('resumeRecAria')}
                  variant="secondary"
                  onClick={() => onRecCtrl('resume')}
                  disabled={currentRecStatus !== 'paused'}
                >
                  Rec ⏵
                </Button>
              </Tooltip>

              <Tooltip text={translate('stopRecTooltip')}>
                <Button
                  aria-label={translate('stopRecAria')}
                  variant="secondary"
                  onClick={() => onRecCtrl('stop')}
                  disabled={currentRecStatus === 'inactive'}
                >
                  Rec ⏹
                </Button>
              </Tooltip>
            </Stack>
          </AccordionItem>
        </Accordion>
      </Stack>
    </Card>
  );
}

/* =========================
 *        Panel
 * ========================= */

export default function TasksPanel({ onFinished, setAvailable }) {
  const { t: translate } = useTranslation();
  const toaster = useToaster();

  const [availableSid, setAvailableSid] = useState('');
  const [breakSid, setBreakSid] = useState('');
  const [afterFinishSid, setAfterFinishSid] = useLocalStorage('after_finish_sid', '');

  const [openTransfer, setOpenTransfer] = useState(false);
  const [transferTask, setTransferTask] = useState(null);
  const [agents, setAgents] = useState([]);
  const [target, setTarget] = useState('');
  const [transferMode, setTransferMode] = useState('Agent');
  const [search, setSearch] = useState('');
  const [externalNumber, setExternalNumber] = useState('');

  const [openWrap, setOpenWrap] = useState(false);
  const [wrapTask, setWrapTask] = useState(null);
  const [wrapDisposition, setWrapDisposition] = useState(DISPOSITIONS[0]);
  const [wrapNotes, setWrapNotes] = useState('');

  const [holdStates, setHoldStates] = useState({});
  const [holdConfirmOpen, setHoldConfirmOpen] = useState(false);
  const [holdTask, setHoldTask] = useState(null);

  const [recStatus, setRecStatus] = useState('inactive');
  const [selectedTab, setSelectedTab] = useState('tasks');
  const [reports, setReports] = useState([]);

  const { data: items = [], isLoading: loading, refetch: load } = useQuery({
    queryKey: ['myTasks'],
    queryFn: () => Api.myTasks('wrapping,assigned,reserved'),
    staleTime: 10000,
    onError: (e) => {
      console.error('myTasks error', e);
      toaster.push({ message: translate('tasksLoadError'), variant: 'error' });
    }
  });

  /* ====== estilos de layout (solo UI) ====== */
  const avgSLA = items.length > 0 ? items.reduce((sum, t) => sum + t.age, 0) / items.length : 0;

  /* ====== efectos ====== */
  async function loadActivities() {
    try {
      const acts = (await http.get('/taskrouter/activities')).data || [];
      const avail = acts.find((a) => a.available);
      if (avail) setAvailableSid(avail.sid);
      const br = acts.find((a) => /break/i.test(a.name));
      if (br) setBreakSid(br.sid);
      if (!afterFinishSid && avail) {
        setAfterFinishSid(avail.sid);
      }
    } catch (e) {
      console.error('activities error', e);
      toaster.push({ message: translate('activitiesLoadError'), variant: 'error' });
    }
  }

  useEffect(() => {
    loadActivities();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const agentCallSid = getCallSid();
    if (agentCallSid) {
      const interval = setInterval(async () => {
        try {
          const status = await Api.recStatus(agentCallSid);
          setRecStatus(status);
        } catch (e) {
          console.error('rec status poll error', e);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (selectedTab === 'reports') {
      loadReports();
    }
  }, [selectedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ====== acciones ====== */

  function onFinishPress(t) {
    const suggestedDispo = DISPO_SUGGESTIONS[t.attributes?.intent] || DISPOSITIONS[0];
    setWrapTask(t);
    setWrapDisposition(suggestedDispo);
    setWrapNotes(`Call duration: ${formatMMSS(t.age || 0)}`);
    setOpenWrap(true);
  }

  async function doFinish() {
    if (!wrapTask) return setOpenWrap(false);
    try {
      let totalHold = 0;
      if (holdStates[wrapTask.sid]) {
        totalHold = Math.floor((Date.now() - holdStates[wrapTask.sid].start) / 1000);
        clearInterval(holdStates[wrapTask.sid].timer);
        setHoldStates((prev) => {
          const next = { ...prev };
          delete next[wrapTask.sid];
          return next;
        });
      }

      const updatedNotes = `${wrapNotes}\nHold duration: ${totalHold}s`;

      try {
        await Api.crmLogInteraction({
          customerId: wrapTask.attributes?.customerId || null,
          channel: 'voice',
          intent: wrapTask.attributes?.intent || null,
          taskSid: wrapTask.sid,
          callSid: wrapTask.attributes?.callSid || wrapTask.attributes?.call_sid || null,
          disposition: wrapDisposition,
          notes: updatedNotes,
          holdDuration: totalHold
        });
      } catch (e) {
        console.warn('logInteraction failed (non-blocking)', e?.message || e);
      }

      await Api.completeTask(wrapTask.sid, {
        reason: updatedNotes,
        disposition: wrapDisposition
      });

      setOpenWrap(false);
      await load();

      const stillWrapping = (items || []).some(
        (t) => String(t.assignmentStatus).toLowerCase() === 'wrapping' && t.sid !== wrapTask.sid
      );
      if (!stillWrapping && afterFinishSid && typeof setAvailable === 'function') {
        await setAvailable(afterFinishSid);
      }

      if (typeof onFinished === 'function') onFinished(wrapTask.sid);

      toaster.push({
        message: translate('completeTaskSuccess'),
        variant: 'success',
        dismissAfter: 3000
      });
    } catch (e) {
      console.error('finishTask error', e);
      toaster.push({ message: translate('completeTaskError'), variant: 'error' });
    }
  }

  async function loadAgents() {
    try {
      const list = await Api.availableWorkers();
      setAgents(list.filter((a) => !!a.contactUri));
    } catch (e) {
      console.error('available workers error', e);
      setAgents([]);
      toaster.push({ message: translate('agentsLoadError'), variant: 'error' });
    }
  }

  function onTransfer(t) {
    setTransferTask(t);
    setTarget('');
    setTransferMode('Agent');
    setSearch('');
    setExternalNumber('');
    setOpenTransfer(true);
    loadAgents();
  }

  const filteredAgents = agents.filter((a) =>
    a.friendlyName.toLowerCase().includes(search.toLowerCase())
  );

  const agentCallSid = getCallSid();

  async function doCold() {
    const cSid = transferTask?.attributes?.callSid || transferTask?.attributes?.call_sid;
    const transferTarget = transferMode === 'Agent' ? target : externalNumber;
    if (!cSid || !transferTarget) {
      toaster.push({ message: translate('transferMissingData'), variant: 'error' });
      return;
    }
    try {
      await Api.transferCold({
        customerCallSid: cSid,
        targetIdentity: transferTarget,
        agentCallSid: agentCallSid || undefined
      });
      setOpenTransfer(false);
      toaster.push({ message: translate('transferSuccess'), variant: 'success', dismissAfter: 3000 });
      await load();
    } catch (e) {
      console.error('transfer cold error', e);
      toaster.push({ message: translate('transferError'), variant: 'error' });
    }
  }

  async function doWarm() {
    const cSid = transferTask?.attributes?.callSid || transferTask?.attributes?.call_sid;
    const transferTarget = transferMode === 'Agent' ? target : externalNumber;
    if (!cSid || !agentCallSid || !transferTarget) {
      toaster.push({ message: translate('warmTransferMissingData'), variant: 'error' });
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
      toaster.push({ message: translate('transferSuccess'), variant: 'success', dismissAfter: 3000 });
    } catch (e) {
      console.error('transfer warm error', e);
      toaster.push({ message: translate('warmTransferError'), variant: 'error' });
    }
  }

  async function doCompleteTransfer() {
    if (!agentCallSid) {
      toaster.push({ message: translate('noAgentCallSid'), variant: 'error' });
      return;
    }
    try {
      await Api.transferComplete(agentCallSid);
      await load();
      toaster.push({ message: translate('transferSuccess'), variant: 'success', dismissAfter: 3000 });
    } catch (e) {
      console.error('transfer complete error', e);
      toaster.push({ message: translate('completeTransferError'), variant: 'error' });
    }
  }

  function confirmHold(t) {
    setHoldTask(t);
    setHoldConfirmOpen(true);
  }

  async function doConfirmedHold() {
    const cSid = holdTask.attributes?.callSid || holdTask.attributes?.call_sid;
    if (!cSid) {
      toaster.push({ message: translate('noCustomerCallSid'), variant: 'error' });
      return;
    }
    try {
      await Api.holdStart({
        taskSid: holdTask.sid,
        customerCallSid: cSid,
        agentCallSid,
        who: 'customer'
      });
      const timer = setInterval(() => {
        setHoldStates((prev) => ({ ...prev }));
      }, 1000);
      setHoldStates((prev) => ({ ...prev, [holdTask.sid]: { start: Date.now(), timer } }));
      setHoldConfirmOpen(false);
    } catch (e) {
      console.error('hold error', e);
      toaster.push({ message: translate('holdError'), variant: 'error' });
    }
  }

  async function onUnhold(t) {
    const cSid = t.attributes?.callSid || t.attributes?.call_sid;
    if (!cSid) {
      toaster.push({ message: translate('noCustomerCallSid'), variant: 'error' });
      return;
    }
    try {
      await Api.holdStop({
        taskSid: t.sid,
        customerCallSid: cSid,
        agentCallSid,
        who: 'customer'
      });
      if (holdStates[t.sid]) {
        clearInterval(holdStates[t.sid].timer);
        setHoldStates((prev) => {
          const next = { ...prev };
          delete next[t.sid];
          return next;
        });
      }
    } catch (e) {
      console.error('unhold error', e);
      toaster.push({ message: translate('unholdError'), variant: 'error' });
    }
  }

  async function onRecCtrl(action) {
    try {
      if (!agentCallSid) {
        toaster.push({ message: translate('noActiveCall'), variant: 'error' });
        return;
      }
      if (action === 'start') await Api.recStart(agentCallSid);
      if (action === 'pause') await Api.recPause(agentCallSid);
      if (action === 'resume') await Api.recResume(agentCallSid);
      if (action === 'stop') await Api.recStop(agentCallSid);
    } catch (e) {
      console.error('rec ctrl error', e);
      toaster.push({ message: translate('recControlError'), variant: 'error' });
    }
  }

  async function loadReports() {
    try {
      const data = await Api.reports();
      setReports(data);
    } catch (e) {
      console.error('reports error', e);
      toaster.push({ message: translate('reportsLoadError'), variant: 'error' });
    }
  }

  /* =========================
   *   Render (UI reforzado)
   * ========================= */
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
      <style>{`
        .tp__body{ flex:1; min-height:0; overflow:auto; }
        .tp__grid{
          display:grid;
          gap: var(--paste-space-60);
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          align-items: stretch;
        }
      `}</style>

      <Toaster {...toaster} />

      {/* Header */}
      <Stack orientation="vertical" spacing="space40">
        <Stack
          orientation={['vertical', 'horizontal']}
          spacing="space40"
          distribution="spaceBetween"
          alignment="center"
          style={{ flexWrap: 'wrap' }}
        >
          <Heading as="h3" variant="heading30" margin="space0">
            {translate('myTasks')}
          </Heading>

          <Stack orientation={['vertical', 'horizontal']} spacing="space40" alignment="center" style={{ flexWrap: 'wrap' }}>
            <Stack orientation={['vertical', 'horizontal']} spacing="space30" alignment="center" style={{ flexWrap: 'wrap' }}>
              <Label htmlFor="afterfinish">{translate('afterFinish')}</Label>
              <Select
                id="afterfinish"
                value={afterFinishSid}
                onChange={(e) => {
                  setAfterFinishSid(e.target.value);
                }}
              >
                <Option value={availableSid || ''}>{translate('available')}</Option>
                {breakSid ? <Option value={breakSid}>{translate('onBreak')}</Option> : null}
              </Select>
            </Stack>

            <Stack orientation="horizontal" spacing="space40" style={{ flexWrap: 'wrap' }}>
              <Button
                aria-label={translate('refreshAria')}
                onClick={load}
                disabled={loading}
                variant="secondary"
              >
                {loading ? translate('loading') : translate('refresh')}
              </Button>
              <Button
                aria-label={translate('completeTransferAria')}
                variant="destructive"
                onClick={doCompleteTransfer}
                disabled={!agentCallSid}
                title={
                  agentCallSid
                    ? translate('completeWarmTransferTitle')
                    : translate('noActiveCallTitle')
                }
              >
                {translate('completeTransfer')}
              </Button>
            </Stack>
          </Stack>

          <Badge as="span">
            {translate('avgSLA')}: {formatMMSS(avgSLA)}
          </Badge>
        </Stack>

        <Separator orientation="horizontal" />
      </Stack>

      {/* Body con tabs (scroll interno) */}
      <Box className="tp__body" marginTop="space60">
        {loading ? (
          <SkeletonLoader />
        ) : !items.length ? (
          <Box color="colorTextWeak">{translate('noTasks')}</Box>
        ) : (
          <Tabs selectedId={selectedTab} onSelect={setSelectedTab}>
            <TabList aria-label={translate('tabsAria')}>
              <Tab id="tasks">{translate('tasks')}</Tab>
              <Tab id="reports">{translate('reports')}</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <Box className="tp__grid">
                  {items.map((t) => (
                    <TaskCard
                      key={t.sid}
                      t={t}
                      onFinishPress={onFinishPress}
                      onTransfer={onTransfer}
                      onHold={confirmHold}
                      onUnhold={onUnhold}
                      onRecCtrl={onRecCtrl}
                      holdStates={holdStates}
                      recStatus={recStatus}
                    />
                  ))}
                </Box>
              </TabPanel>

              <TabPanel>
                <Stack orientation="vertical" spacing="space40">
                  {reports.map((report) => (
                    <Card key={report.id} padding="space70">
                      {report.summary}
                    </Card>
                  ))}
                </Stack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        )}
      </Box>

      {/* ====== Modals & dialogs ====== */}

      {/* Transfer */}
      <Modal
        isOpen={openTransfer}
        onDismiss={() => setOpenTransfer(false)}
        ariaLabel="transfer-call"
        size="default"
      >
        <ModalHeader>
          <ModalHeading>{translate('transferCall')}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation="vertical" spacing="space50">
            <RadioGroup
              name="transferMode"
              value={transferMode}
              onChange={(value) => setTransferMode(value)}
              legend={translate('transferMode')}
            >
              <Radio id="agent" value="Agent">{translate('agent')}</Radio>
              <Radio id="external" value="External">{translate('external')}</Radio>
            </RadioGroup>

            {transferMode === 'Agent' ? (
              <>
                <Input
                  placeholder={translate('searchAgents')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Label htmlFor="agent-select">{translate('agentDestination')}</Label>
                <Select
                  id="agent-select"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <Option value="" disabled>{translate('chooseAgent')}</Option>
                  <Option value="">—</Option>
                  {filteredAgents.map((a) => (
                    <Option key={a.workerSid} value={a.contactUri}>
                      {a.friendlyName} ({a.contactUri})
                    </Option>
                  ))}
                </Select>
              </>
            ) : (
              <Input
                placeholder={translate('enterPhone')}
                value={externalNumber}
                onChange={(e) => setExternalNumber(e.target.value)}
              />
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setOpenTransfer(false)}>
              {translate('cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={doWarm}
              disabled={!target && !externalNumber}
            >
              {translate('warmTransfer')}
            </Button>
            <Button
              variant="primary"
              onClick={doCold}
              disabled={!target && !externalNumber}
            >
              {translate('coldTransfer')}
            </Button>
          </Stack>
        </ModalFooter>
      </Modal>

      {/* Hold confirm */}
      <AlertDialog
        heading={translate('confirmHold')}
        isOpen={holdConfirmOpen}
        onConfirm={doConfirmedHold}
        onDismiss={() => setHoldConfirmOpen(false)}
      >
        {translate('confirmHoldMessage')}
      </AlertDialog>

      {/* Wrap-up */}
      <Modal
        isOpen={openWrap}
        onDismiss={() => setOpenWrap(false)}
        ariaLabel="wrapup-task"
        size="default"
      >
        <ModalHeader>
          <ModalHeading>{translate('completeTask')}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Stack orientation="vertical" spacing="space60">
            <Box>
              <Label htmlFor="dispo">{translate('disposition')}</Label>
              <Select
                id="dispo"
                value={wrapDisposition}
                onChange={(e) => setWrapDisposition(e.target.value)}
              >
                {DISPOSITIONS.map((d) => (
                  <Option key={d} value={d}>{d}</Option>
                ))}
              </Select>
            </Box>
            <Box>
              <Label htmlFor="notes">{translate('notesReason')}</Label>
              <Input
                id="notes"
                value={wrapNotes}
                onChange={(e) => setWrapNotes(e.target.value)}
                placeholder={translate('shortNotesPlaceholder')}
              />
            </Box>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Stack orientation={['vertical', 'horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setOpenWrap(false)}>
              {translate('cancel')}
            </Button>
            <Button variant="primary" onClick={doFinish}>
              {translate('complete')}
            </Button>
          </Stack>
        </ModalFooter>
      </Modal>
    </Box>
  );
}
