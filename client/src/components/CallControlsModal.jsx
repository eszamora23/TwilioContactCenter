import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@twilio-paste/core/box';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';
import { Button } from '@twilio-paste/core/button';
import { Separator } from '@twilio-paste/core/separator';
import {
  Modal, ModalHeader, ModalHeading, ModalBody, ModalFooter
} from '@twilio-paste/core/modal';
import Api from '../services/index.js';
import { getCallSid } from '../softphone/callSidStore.js';

export default function CallControlsModal({ isOpen, onDismiss }) {
  const [agentCallSid, setAgentCallSid] = useState(null);
  const [task, setTask] = useState(null);             // Task activa (para customerCallSid / taskSid)
  const [customerCallSid, setCustomerCallSid] = useState(null);
  const [recStatus, setRecStatus] = useState('inactive'); // 'inactive' | 'in-progress' | 'paused' | 'stopped'
  const [muted, setMuted] = useState(false);
  const [holding, setHolding] = useState(false);
  const chanRef = useRef(null);

  const canHold = useMemo(
    () => Boolean(agentCallSid && customerCallSid),
    [agentCallSid, customerCallSid]
  );

  // --- escuchar estado del Softphone (mute) via BroadcastChannel
  useEffect(() => {
    const ch = new BroadcastChannel('softphone-control');
    chanRef.current = ch;

    ch.onmessage = (evt) => {
      const msg = evt?.data || {};
      if (msg.type === 'state') {
        setMuted(!!msg.payload?.isMuted);
      }
    };
    // pedir estado inicial
    try { ch.postMessage({ type: 'cmd', payload: { action: 'ping' } }); } catch {}

    return () => { try { ch.close(); } catch {} };
  }, [isOpen]);

  // --- al abrir: obtener callSid agente + task activa + status de recording
  useEffect(() => {
    if (!isOpen) return;
    const sid = getCallSid();
    setAgentCallSid(sid || null);

    (async () => {
      try {
        const list = await Api.myTasks('assigned,reserved,wrapping');
        // Elegimos la que tenga callSid (customer) disponible primero
        const picked = list.find((t) => t?.attributes?.callSid || t?.attributes?.call_sid) || list[0] || null;
        setTask(picked || null);
        setCustomerCallSid(picked?.attributes?.callSid || picked?.attributes?.call_sid || null);
      } catch { /* noop */ }

      if (sid) {
        try {
          const s = await Api.recStatus(sid);
          setRecStatus(s || 'inactive');
        } catch { setRecStatus('inactive'); }
      }
    })();
  }, [isOpen]);

  // --- poll recording status mientras esté abierto y haya llamada
  useEffect(() => {
    if (!isOpen || !agentCallSid) return;
    const iv = setInterval(async () => {
      try {
        const s = await Api.recStatus(agentCallSid);
        setRecStatus(s || 'inactive');
      } catch { /* noop */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [isOpen, agentCallSid]);

  // --- helpers de comandos al Softphone (mute/hangup)
  const sendCmd = (action) => {
    try { chanRef.current?.postMessage({ type: 'cmd', payload: { action } }); } catch {}
  };

  // --- Recording controls
  const startRec  = async () => { if (agentCallSid) { await Api.recStart(agentCallSid); setRecStatus('in-progress'); } };
  const pauseRec  = async () => { if (agentCallSid) { await Api.recPause(agentCallSid); setRecStatus('paused'); } };
  const resumeRec = async () => { if (agentCallSid) { await Api.recResume(agentCallSid); setRecStatus('in-progress'); } };
  const stopRec   = async () => { if (agentCallSid) { await Api.recStop(agentCallSid);  setRecStatus('stopped'); } };

  // --- Hold controls (cliente)
  const hold = async () => {
    if (!canHold) return;
    await Api.holdStart({
      taskSid: task?.sid,
      customerCallSid,
      agentCallSid,
      who: 'customer'
    });
    setHolding(true);
  };
  const unhold = async () => {
    if (!canHold) return;
    await Api.holdStop({
      taskSid: task?.sid,
      customerCallSid,
      agentCallSid,
      who: 'customer'
    });
    setHolding(false);
  };

  const openSoftphonePopout = () => {
    window.open(
      `${window.location.origin}/#softphone-host`,
      'softphone_popup',
      'width=420,height=640,menubar=no,toolbar=no,resizable=yes,scrollbars=yes,status=no'
    );
  };

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} size="default">
      <ModalHeader>
        <ModalHeading>Call controls</ModalHeading>
      </ModalHeader>
      <ModalBody>
        <Stack orientation="vertical" spacing="space70">
          {/* Estado */}
          <Box>
            <Stack orientation="horizontal" spacing="space50" alignment="center" style={{ flexWrap: 'wrap' }}>
              <Badge as="span" variant={recStatus === 'in-progress' ? 'new' : recStatus === 'paused' ? 'warning' : 'neutral'}>
                Recording: {recStatus}
              </Badge>
              {agentCallSid ? (
                <Badge as="span" variant="success">Agent call: {agentCallSid}</Badge>
              ) : (
                <Badge as="span" variant="neutral">No active call</Badge>
              )}
              {customerCallSid ? (
                <Badge as="span" variant="neutral">Customer call: {customerCallSid}</Badge>
              ) : null}
            </Stack>
          </Box>

          <Separator orientation="horizontal" />

          {/* Recording */}
          <Stack orientation={['vertical','horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={startRec}  disabled={!agentCallSid || (recStatus !== 'inactive' && recStatus !== 'stopped')}>Rec ⏺ Start</Button>
            <Button variant="secondary" onClick={pauseRec}  disabled={recStatus !== 'in-progress'}>Rec ⏸ Pause</Button>
            <Button variant="secondary" onClick={resumeRec} disabled={recStatus !== 'paused'}>Rec ⏵ Resume</Button>
            <Button variant="secondary" onClick={stopRec}   disabled={recStatus === 'inactive'}>Rec ⏹ Stop</Button>
          </Stack>

          {/* Call actions */}
          <Stack orientation={['vertical','horizontal']} spacing="space40" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={holding ? unhold : hold} disabled={!canHold}>
              {holding ? 'Resume (unhold)' : 'Hold'}
            </Button>
            <Button variant="secondary" onClick={() => { sendCmd(muted ? 'unmute' : 'mute'); setMuted(!muted); }} disabled={!agentCallSid}>
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="destructive" onClick={() => { sendCmd('hangup'); onDismiss?.(); }} disabled={!agentCallSid}>
              Hangup
            </Button>
          </Stack>

          <Separator orientation="horizontal" />

          <Button variant="secondary" onClick={openSoftphonePopout}>Open Softphone pop-out</Button>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onDismiss}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
