import http, { retry } from './http.js';
import { useQuery } from '@tanstack/react-query';

export const workerToken = () =>
  retry(() => http.get('/token/tr-worker').then((r) => r.data.token));

export const myTasks = (statuses = 'wrapping,assigned,reserved') =>
  http.get('/taskrouter/my-tasks', { params: { statuses } }).then((r) => r.data);

export const completeTask = (taskSid, body = {}) =>
  http.post(`/taskrouter/tasks/${taskSid}/complete`, body).then((r) => r.data);

export const availableWorkers = () =>
  http.get('/taskrouter/available-workers').then((r) => r.data);

export const presence = () =>
  http.get('/taskrouter/presence').then((r) => r.data);

export const recentEvents = () =>
  http.get('/events/recent').then((r) => r.data);

export const useMyTasks = (statuses) => useQuery({
  queryKey: ['myTasks', statuses],
  queryFn: () => myTasks(statuses),
  staleTime: 10000,
});

export const usePresence = () => useQuery({
  queryKey: ['presence'],
  queryFn: presence,
  staleTime: 10000,
});
