import api, { retry } from './http.js';

export const workerToken = () =>
  retry(() => api.get('/token/tr-worker').then(r => r.data.token));

export const myTasks = (statuses = 'wrapping,assigned,reserved') =>
  api.get('/taskrouter/my-tasks', { params: { statuses } }).then(r => r.data);

export const completeTask = (taskSid, body = {}) =>
  api.post(`/taskrouter/tasks/${taskSid}/complete`, body).then(r => r.data);

export const availableWorkers = () =>
  api.get('/taskrouter/available-workers').then(r => r.data);

export const presence = () =>
  api.get('/taskrouter/presence').then(r => r.data);

export const recentEvents = () =>
  api.get('/events/recent').then(r => r.data);
