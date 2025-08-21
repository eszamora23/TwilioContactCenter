import axios from 'axios';
import { rest } from '../twilio.js';
import { serverEnv as env } from '@shared/env';

export const listActivities = () =>
  rest.taskrouter.v1.workspaces(env.workspaceSid).activities.list({ limit: 50 });

export const listWorkerReservations = (workerSid) =>
  rest.taskrouter.v1.workspaces(env.workspaceSid).workers(workerSid).reservations.list({ limit: 50 });

export const fetchTask = (taskSid) =>
  rest.taskrouter.v1.workspaces(env.workspaceSid).tasks(taskSid).fetch();

export const updateTask = (taskSid, payload) =>
  rest.taskrouter.v1.workspaces(env.workspaceSid).tasks(taskSid).update(payload);

export const listWorkers = () =>
  rest.taskrouter.v1.workspaces(env.workspaceSid).workers.list({ limit: 200 });

export async function listWorkersWithRetry(retries = 2, delay = 300) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await listWorkers();
    } catch (e) {
      last = e; if (i === retries) throw last; await new Promise(r => setTimeout(r, delay));
    }
  }
}

const _events = [];
export function pushEvent(type, payload) {
  _events.push({ type, payload, ts: new Date().toISOString() });
  if (_events.length > 500) _events.shift();
}
export const recentEvents = () => _events.slice(-200);
export { axios, env };
