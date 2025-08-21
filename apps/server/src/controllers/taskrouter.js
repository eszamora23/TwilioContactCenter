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

export function assignment(req, res) {
  try {
    const taskSid = String(req.body.TaskSid || '').trim();
    if (!env.callerId) {
      return res.status(200).json({ instruction: 'reject', reason: 'missing callerId' });
    }
    const conferenceName = taskSid || `task-${Date.now()}`;
    const payload = {
      instruction: 'conference',
      from: env.callerId,
      conference_name: conferenceName,
      end_conference_on_exit: false,
      beep: 'onEnter',
      wait_url: env.holdMusicUrl,
      post_work_activity_sid: env.wrapActivitySid,
    };
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ instruction: 'reject', reason: 'assignment error' });
  }
}

export async function events(req, res) {
  console.log('TR event', req.body.EventType, req.body.TaskSid || '', req.body.ReservationSid || '');
  if (req.body.EventType === 'worker.activity.update') {
    const presenceData = await listWorkers();
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
    req.app.get('io')?.emit('presence_update', { data: formatted });
  }
  res.sendStatus(200);
}

export async function activities(_req, res) {
  try {
    const list = await listActivities();
    res.json(list.map(a => ({ sid: a.sid, name: a.friendlyName, available: a.available })));
  } catch {
    res.status(500).json({ error: 'cannot fetch activities' });
  }
}

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

export async function completeTask(req, res) {
  try {
    const { taskSid } = req.params;
    const { reason, disposition } = req.body || {};
    if (!taskSid) return res.status(400).json({ error: 'missing taskSid' });
    const task = await fetchTask(taskSid);
    if (String(task.assignmentStatus).toLowerCase() !== 'wrapping') {
      return res.status(400).json({ error: 'task is not in wrapping', assignmentStatus: task.assignmentStatus });
    }
    let attrs = {};
    try { attrs = JSON.parse(task.attributes || '{}'); } catch {}
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
      } catch {}
      out.push({ workerSid: w.sid, friendlyName: w.friendlyName, contactUri: contact });
    }
    res.json(out);
  } catch (e) {
    console.error('[AVAILABLE_WORKERS] error', e);
    res.status(500).json({ error: 'cannot list available workers' });
  }
}

export async function presence(_req, res) {
  try {
    const workers = await listWorkersWithRetry();
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
}

export function recent(req, res) {
  res.json(recentEvents());
}

function safeParseJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

