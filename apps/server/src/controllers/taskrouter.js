﻿// TwilioContactCenter/apps/server/src/controllers/taskrouter.js
import { requireAuth } from 'shared/auth';
import {
  listActivities,
  listWorkerReservations,
  fetchTask,
  updateTask,
  listWorkers,
  listWorkersWithRetry,
  pushEvent,
  recentEvents,
  axios,
  env
} from '../services/taskrouter.js';
import { rest } from '../twilio.js'; // REST client for TaskRouter ops

const GUARD_CONTACT_ONLY = String(process.env.RESV_GUARD_CONTACT_ONLY ?? 'true').toLowerCase() !== 'false';

/* ---------------------------
 * Helpers
 * --------------------------- */

// Normalize to a Twilio Client "contact_uri"
function toContactUri(raw) {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (val.startsWith('client:')) return val;
  if (val.startsWith('agent:')) return `client:${val}`;
  return `client:agent:${val}`;
}

function safeJson(x) {
  try { return x ? JSON.parse(x) : {}; } catch { return {}; }
}

function safeParseJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

/* ---------------------------
 * Assignment Callback (robust)
 * ---------------------------
 * Uses the TaskRouter "conference" instruction with **camelCase**
 * participant/conference parameters (per Twilio docs).
 * - Falls back to fetching Worker from TaskRouter if webhook lacks attributes
 * - Adds optional status callbacks for observability
 */
export async function assignment(req, res) {
  try {
    const taskSid = String(req.body.TaskSid || '').trim();
    const channelName = String(req.body.TaskChannelUniqueName || '').toLowerCase();

    const attrs = safeJson(req.body.TaskAttributes);
    const workerAttrs = safeJson(req.body.WorkerAttributes);

    // Prefer explicit selection (e.g., from chat join), then worker webhooks attrs
    let dialTarget = toContactUri(
      String(attrs.selected_contact_uri || workerAttrs.contact_uri || '').trim()
    );

    // Fallback: fetch Worker from TR if webhook did not include contact_uri (common in prod)
    if (!dialTarget && req.body.WorkerSid) {
      try {
        const wk = await rest.taskrouter.v1
          .workspaces(env.workspaceSid)
          .workers(req.body.WorkerSid)
          .fetch();
        const wAttrs = safeJson(wk.attributes);
        dialTarget = toContactUri(wAttrs.contact_uri || '');
      } catch (e) {
        console.warn('[assignment] fallback fetch worker failed:', e?.message || e);
      }
    }

    // Chat tasks are accepted immediately (no conferencing)
    const isChat =
      channelName === 'chat' ||
      String(attrs.channel || '').toLowerCase() === 'chat' ||
      !!attrs.conversationSid;
    if (isChat) {
      return res.status(200).json({ instruction: 'accept' });
    }

    if (!env.callerId) {
      return res.status(200).json({ instruction: 'reject', reason: 'missing callerId' });
    }

    if (!dialTarget) {
      // No agent contact: reject so TaskRouter offers the reservation to the next eligible Worker
      return res.status(200).json({ instruction: 'reject', reason: 'no contact_uri' });
    }

    // ✅ Doc-accurate conference payload (camelCase keys)
    const payload = {
      instruction: 'conference',
      from: env.callerId,    // Twilio-verified caller ID or owned number
      to: dialTarget,        // e.g. "client:agent:42"
      timeout: 25,
      record: 'do-not-record',
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      beep: 'onEnter',
      ...(env.holdMusicUrl ? { waitUrl: env.holdMusicUrl } : {}),
      ...(env.publicBaseUrl ? {
        statusCallback: `${env.publicBaseUrl}/api/voice/agent-call-events`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      } : {}),
      ...(env.publicBaseUrl ? {
        conferenceStatusCallback: `${env.publicBaseUrl}/api/voice/conference-events`,
        conferenceStatusCallbackEvent: ['start', 'end', 'join', 'leave', 'mute', 'hold'],
      } : {}),
    };

    return res.status(200).json(payload);
  } catch (e) {
    console.warn('[assignment] error:', e?.message || e);
    return res.status(200).json({ instruction: 'reject', reason: 'assignment error' });
  }
}

/* ---------------------------
 * Events Webhook (TaskRouter)
 * ---------------------------
 * - Push presence updates to Socket.IO
 * - Auto-reject reservations lacking a dialable contact (optionally availability)
 *   with robust fallback to TaskRouter Worker fetch.
 */
export async function events(req, res) {
  console.log('TR event', req.body.EventType, req.body.TaskSid || '', req.body.ReservationSid || '');

  // Presence update
  if (req.body.EventType === 'worker.activity.update') {
    const presenceData = await listWorkers();
    const formatted = presenceData.map(w => {
      let contact = null;
      try { contact = JSON.parse(w.attributes || '{}').contact_uri || null; } catch { }
      return {
        workerSid: w.sid,
        friendlyName: w.friendlyName,
        activitySid: w.activitySid,
        activityName: w.activityName,
        available: !!w.available,
        contactUri: contact
      };
    });
    req.app.get('io')?.emit('presence_update', { data: formatted });
  }

  // Guard on reservation.created
  if (req.body.EventType === 'reservation.created') {
    try {
      const workspaceSid = env.workspaceSid;
      const workerSid = req.body.WorkerSid;
      const reservationSid = req.body.ReservationSid;

      // Try webhook attributes first
      const workerAttrs = safeJson(req.body.WorkerAttributes);
      let contactUri = toContactUri(workerAttrs.contact_uri || '');

      // 🔧 Fallback: fetch Worker if missing contact_uri (typical on VPS/prod)
      if (!contactUri && workerSid) {
        try {
          const wk = await rest.taskrouter.v1.workspaces(workspaceSid).workers(workerSid).fetch();
          const wAttrs = safeJson(wk.attributes);
          contactUri = toContactUri(wAttrs.contact_uri || '');
        } catch (e) {
          console.warn('[reservation.guard] fetch worker failed:', e?.message || e);
        }
      }

      // Only reject if we truly cannot dial the agent (or also not available if configured)
      const availableFlag = String(req.body.WorkerActivityAvailable ?? '').toLowerCase();
      const available = availableFlag === 'true' || req.body.WorkerActivityAvailable === true;
      const shouldReject = GUARD_CONTACT_ONLY ? !contactUri : (!contactUri || !available);

      if (shouldReject) {
        await rest.taskrouter.v1
          .workspaces(workspaceSid)
          .workers(workerSid)
          .reservations(reservationSid)
          .update({ reservationStatus: 'rejected' });

        pushEvent('RESERVATION_REJECTED_AUTOGUARD', {
          workerSid,
          reservationSid,
          reason: !contactUri ? 'no_contact_uri' : 'not_available'
        });
      }
    } catch (e) {
      console.warn('[reservation.guard] skipped', e?.message || e);
    }
  }

  res.sendStatus(200);
}

/* ---------------------------
 * Activities list
 * --------------------------- */
export async function activities(_req, res) {
  try {
    const list = await listActivities();
    res.json(list.map(a => ({ sid: a.sid, name: a.friendlyName, available: a.available })));
  } catch {
    res.status(500).json({ error: 'cannot fetch activities' });
  }
}

/* ---------------------------
 * My Tasks (for the Agent)
 * --------------------------- */
export async function myTasks(req, res) {
  try {
    const { workerSid } = req.claims;
    if (!workerSid) return res.status(400).json({ error: 'missing workerSid in claims' });

    const statuses = (req.query.statuses || 'wrapping,assigned,reserved')
      .split(',').map(s => s.trim().toLowerCase());

    const reservations = await listWorkerReservations(workerSid);
    const uniqueTaskSids = [...new Set(reservations.map(r => r.taskSid).filter(Boolean))];

    const fetchedTasks = await Promise.all(
      uniqueTaskSids.map(taskSid => fetchTask(taskSid).catch(() => null))
    );

    const tasks = fetchedTasks
      .filter(t => t && statuses.includes(String(t.assignmentStatus).toLowerCase()))
      .map(t => ({
        sid: t.sid,
        assignmentStatus: t.assignmentStatus,
        age: t.age,
        reason: t.reason || null,
        attributes: safeParseJson(t.attributes),
      }));

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
}

/* ---------------------------
 * Force WRAPPING (chat-centric)
 * --------------------------- */
export async function wrapTask(req, res) {
  try {
    const { taskSid } = req.params;
    const { reason = 'Wrap from Agent UI', disposition } = req.body || {};
    if (!taskSid) return res.status(400).json({ error: 'missing taskSid' });

    const task = await fetchTask(taskSid);
    const status = String(task.assignmentStatus).toLowerCase();

    let attrs = {};
    try { attrs = JSON.parse(task.attributes || '{}'); } catch { }
    if (disposition) attrs.disposition = disposition;
    if (reason) attrs.wrapup_reason = reason;

    if (status === 'wrapping') {
      if (disposition || reason) {
        await updateTask(taskSid, { attributes: JSON.stringify(attrs) });
      }
      pushEvent('TASK_WRAPPING', { taskSid, reason, disposition });
      return res.json({ ok: true, taskSid, assignmentStatus: 'wrapping' });
    }

    if (status === 'assigned') {
      const updated = await updateTask(taskSid, {
        assignmentStatus: 'wrapping',
        reason: String(reason || 'Wrap from Agent UI').slice(0, 200),
        attributes: JSON.stringify(attrs),
      });
      pushEvent('TASK_WRAPPING', { taskSid: updated.sid, reason, disposition });
      return res.json({ ok: true, taskSid: updated.sid, assignmentStatus: 'wrapping' });
    }

    return res.status(400).json({
      error: `cannot wrap task in status ${task.assignmentStatus}`,
      assignmentStatus: task.assignmentStatus
    });
  } catch (e) {
    console.error('[WRAP_TASK] error:', e);
    return res.status(500).json({ error: 'cannot wrap task' });
  }
}

/* ---------------------------
 * Complete Task
 * --------------------------- */
export async function completeTask(req, res) {
  try {
    const { taskSid } = req.params;
    const { reason, disposition, autoWrap } = req.body || {};
    if (!taskSid) return res.status(400).json({ error: 'missing taskSid' });

    let task = await fetchTask(taskSid);
    let status = String(task.assignmentStatus).toLowerCase();

    if (autoWrap && status === 'assigned') {
      let attrs = {};
      try { attrs = JSON.parse(task.attributes || '{}'); } catch { }
      if (disposition) attrs.disposition = disposition;
      if (reason) attrs.wrapup_reason = reason;
      await updateTask(taskSid, {
        assignmentStatus: 'wrapping',
        reason: String(reason || 'Wrap before complete').slice(0, 200),
        attributes: JSON.stringify(attrs),
      });
      task = await fetchTask(taskSid);
      status = String(task.assignmentStatus).toLowerCase();
    }

    if (status !== 'wrapping') {
      return res.status(400).json({ error: 'task is not in wrapping', assignmentStatus: task.assignmentStatus });
    }

    let attrs = {};
    try { attrs = JSON.parse(task.attributes || '{}'); } catch { }
    if (disposition) attrs.disposition = disposition;
    if (reason) attrs.wrapup_reason = reason;

    const updated = await updateTask(taskSid, {
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
}

/* ---------------------------
 * Available Workers (for transfer lists)
 * --------------------------- */
export async function availableWorkers(_req, res) {
  try {
    const acts = await listActivities();
    const availableSids = acts.filter(a => a.available).map(a => a.sid);
    const workers = await listWorkers();
    const out = [];
    for (const w of workers) {
      if (!availableSids.includes(w.activitySid)) continue;
      let contact = null;
      try {
        const attrs = JSON.parse(w.attributes || '{}');
        contact = attrs.contact_uri || null;
      } catch { }
      out.push({ workerSid: w.sid, friendlyName: w.friendlyName, contactUri: contact });
    }
    res.json(out);
  } catch (e) {
    console.error('[AVAILABLE_WORKERS] error', e);
    res.status(500).json({ error: 'cannot list available workers' });
  }
}

/* ---------------------------
 * Presence (with tiny cache to avoid thundering-herd)
 * --------------------------- */
let _presenceCache = { at: 0, data: [] };

export async function presence(_req, res) {
  try {
    // 2s soft TTL cache
    if (Date.now() - _presenceCache.at > 2000) {
      const workers = await listWorkersWithRetry();
      _presenceCache = { at: Date.now(), data: workers };
    }

    const workers = _presenceCache.data;
    const out = workers.map(w => {
      let contact = null;
      try { contact = JSON.parse(w.attributes || '{}').contact_uri || null; } catch { }
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
}

/* ---------------------------
 * Recent in-memory events (debug)
 * --------------------------- */
export function recent(_req, res) {
  res.json(recentEvents());
}
