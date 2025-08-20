// contact-center/server/src/routes/taskrouter.js
import { Router } from 'express';
import axios from 'axios'; // For analytics post
import { env } from '../env.js';
import { verifyTwilioSignature } from '../middleware/verifyTwilio.js';
import { rest } from '../twilio.js';
import { requireAuth } from '../auth.js';

export const taskrouter = Router();

// Assignment Callback: USE CONFERENCE (not dequeue)
taskrouter.post('/taskrouter/assignment', verifyTwilioSignature, (req, res) => {
  try {
    const taskSid = String(req.body.TaskSid || '').trim();

    if (!env.callerId) {
      return res.status(200).json({ instruction: 'reject', reason: 'missing callerId' });
    }

    // Use the Task SID itself as the conference friendlyName
    // so HOLD/RESUME can reliably find it later.
    const conferenceName = taskSid || `task-${Date.now()}`;

    const payload = {
      instruction: 'conference',
      from: env.callerId,
      conference_name: conferenceName,
      // don’t tear down when agent leaves
      end_conference_on_exit: false,
      // useful defaults for CC flows
      beep: 'onEnter',
      wait_url: env.holdMusicUrl,
      post_work_activity_sid: env.wrapActivitySid,
      // Optional observability:
      // conference_status_callback: env.publicBaseUrl ? `${env.publicBaseUrl}/api/taskrouter/events` : undefined,
      // conference_status_callback_event: 'start end join leave mute hold'
    };

    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ instruction: 'reject', reason: 'assignment error' });
  }
});


// Webhook de eventos de TaskRouter (opcional, auditoría)
taskrouter.post('/taskrouter/events', verifyTwilioSignature, async (req, res) => {
  console.log('TR event', req.body.EventType, req.body.TaskSid || '', req.body.ReservationSid || '');
  if (req.body.EventType === 'worker.activity.update') {
    // En lugar de solo emitir 'presence_update', calcula y emite los datos actualizados
    const presenceData = await rest.taskrouter.v1.workspaces(env.workspaceSid).workers.list({ limit: 200 });
    const formatted = presenceData.map(w => {
      let contact = null;
      try { contact = JSON.parse(w.attributes || '{}').contact_uri || null; } catch {}
      return {
        workerSid: w.sid,
        friendlyName: w.friendlyName,
        activitySid: w.activitySid,
        activityName: w.activityName,
        available: !!w.available,
        contactUri: contact
      };
    });
    req.app.get('io')?.emit('presence_update', { data: formatted }); // Emitir con { data: [...] }
  }
  res.sendStatus(200);
});

// Listar Activities (para UI)
taskrouter.get('/taskrouter/activities', async (_req, res) => {
  try {
    const list = await rest.taskrouter.v1
      .workspaces(env.workspaceSid)
      .activities.list({ limit: 50 });
    res.json(list.map(a => ({ sid: a.sid, name: a.friendlyName, available: a.available })));
  } catch (e) {
    res.status(500).json({ error: 'cannot fetch activities' });
  }
});

// Listar las tasks del worker autenticado (derivadas de sus reservations)
taskrouter.get('/taskrouter/my-tasks', requireAuth, async (req, res) => {
  try {
    const { workerSid } = req.claims;
    if (!workerSid) return res.status(400).json({ error: 'missing workerSid in claims' });

    const statuses = (req.query.statuses || 'wrapping,assigned,reserved')
      .split(',').map(s => s.trim().toLowerCase());

    const reservations = await rest.taskrouter.v1
      .workspaces(env.workspaceSid)
      .workers(workerSid)
      .reservations
      .list({ limit: 50 });

    const uniqueTaskSids = [...new Set(reservations.map(r => r.taskSid).filter(Boolean))];

    const tasks = [];
    for (const taskSid of uniqueTaskSids) {
      try {
        const t = await rest.taskrouter.v1.workspaces(env.workspaceSid).tasks(taskSid).fetch();
        if (statuses.includes(String(t.assignmentStatus).toLowerCase())) {
          tasks.push({
            sid: t.sid,
            assignmentStatus: t.assignmentStatus,
            age: t.age,
            reason: t.reason || null,
            attributes: safeParseJson(t.attributes),
          });
        }
      } catch { /* ignore */ }
    }

    const resvByTask = {};
    for (const r of reservations) {
      if (!resvByTask[r.taskSid]) resvByTask[r.taskSid] = [];
      resvByTask[r.taskSid].push({
        sid: r.sid,
        reservationStatus: r.reservationStatus,
        dateCreated: r.dateCreated,
      });
    }

    const enriched = tasks.map(t => ({ ...t, reservations: resvByTask[t.sid] || [] }));
    return res.json(enriched);
  } catch (e) {
    console.error('[MY_TASKS] error:', e);
    return res.status(500).json({ error: 'cannot list my tasks' });
  }
});

/**
 * Completar una task (wrapping -> completed) con disposition/reason
 * Body: { reason?, disposition? }
 */
taskrouter.post('/taskrouter/tasks/:taskSid/complete', requireAuth, async (req, res) => {
  try {
    const { taskSid } = req.params;
    const { reason, disposition } = req.body || {};
    if (!taskSid) return res.status(400).json({ error: 'missing taskSid' });

    const task = await rest.taskrouter.v1.workspaces(env.workspaceSid).tasks(taskSid).fetch();
    if (String(task.assignmentStatus).toLowerCase() !== 'wrapping') {
      return res.status(400).json({ error: 'task is not in wrapping', assignmentStatus: task.assignmentStatus });
    }

    let attrs = {};
    try { attrs = JSON.parse(task.attributes || '{}'); } catch {}
    if (disposition) attrs.disposition = disposition;
    if (reason) attrs.wrapup_reason = reason;

    const updated = await rest.taskrouter.v1
      .workspaces(env.workspaceSid)
      .tasks(taskSid)
      .update({
        assignmentStatus: 'completed',
        reason: reason ? String(reason).slice(0, 200) : 'Finished from Agent UI',
        attributes: JSON.stringify(attrs)
      });

    pushEvent('TASK_COMPLETED', {
      taskSid: updated.sid,
      workerSid: req.claims?.workerSid || null,
      disposition: disposition || null,
      reason: reason || null
    });

    // Send to analytics
    try {
      await axios.post('https://analytics.example.com/track', {
        disposition,
        duration: task.age,
        intent: attrs.intent,
      });
    } catch (analyticsError) {
      console.warn('Analytics post failed', analyticsError);
    }

    return res.json({
      sid: updated.sid,
      assignmentStatus: updated.assignmentStatus,
      reason: updated.reason || null
    });
  } catch (e) {
    console.error('[COMPLETE_TASK] error:', e);
    return res.status(500).json({ error: 'cannot complete task' });
  }
});

// Listar workers con Activity.available=true (para transfer UI)
taskrouter.get('/taskrouter/available-workers', requireAuth, async (_req, res) => {
  try {
    const acts = await rest.taskrouter.v1
      .workspaces(env.workspaceSid)
      .activities.list({ limit: 50 });

    const availableSids = acts.filter(a => a.available).map(a => a.sid);

    const workers = await rest.taskrouter.v1
      .workspaces(env.workspaceSid)
      .workers
      .list({ limit: 200 });

    const out = [];
    for (const w of workers) {
      if (!availableSids.includes(w.activitySid)) continue;
      let contact = null;
      try {
        const attrs = JSON.parse(w.attributes || '{}');
        contact = attrs.contact_uri || null;
      } catch {}
      out.push({
        workerSid: w.sid,
        friendlyName: w.friendlyName,
        contactUri: contact
      });
    }

    res.json(out);
  } catch (e) {
    console.error('[AVAILABLE_WORKERS] error', e);
    res.status(500).json({ error: 'cannot list available workers' });
  }
});

// Presencia (todos los workers)
 taskrouter.get('/taskrouter/presence', requireAuth, async (_req, res) => {
  try {
    const workers = await retry(async () => {
      return rest.taskrouter.v1.workspaces(env.workspaceSid).workers.list({ limit: 200 });
    }, 2, 500); // 2 retries, 500ms backoff

    const out = workers.map(w => {
      let contact = null;
      try { contact = JSON.parse(w.attributes || '{}').contact_uri || null; } catch {}
      return {
        workerSid: w.sid,
        friendlyName: w.friendlyName,
        activitySid: w.activitySid,
        activityName: w.activityName,
        available: !!w.available,
        contactUri: contact
      };
    });
    res.json(out);
  } catch (e) {
    console.error('[PRESENCE] upstream error:', e?.code || e?.message || e);
    res.status(502).json({ error: 'twilio_unreachable', detail: 'Network or DNS issue reaching Twilio TaskRouter' });
  }
});

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function retry(fn, times=2, delay=300){
  let last;
  for (let i=0; i<=times; i++){
    try { return await fn(); } catch (e){ last = e; if (i===times) throw last; await sleep(delay); }
  }
}


// Observabilidad simple (event bus demo)
const _events = [];
export function pushEvent(type, payload) {
  _events.push({ type, payload, ts: new Date().toISOString() });
  if (_events.length > 500) _events.shift();
}
taskrouter.get('/events/recent', requireAuth, (_req, res) => {
  res.json(_events.slice(-200));
});

// Helper local
function safeParseJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}