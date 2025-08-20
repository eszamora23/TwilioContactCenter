// contact-center/client/src/api.js
import axios from 'axios';
import { useQuery } from '@tanstack/react-query'; // For caching wrappers in components

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

const api = axios.create({ baseURL });

export function setAuth(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem('auth_token');
  }
}

// Persistencia simple
const existing = localStorage.getItem('auth_token');
if (existing) setAuth(existing);

// 401 → logout básico
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      setAuth(null);
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

async function retry(fn, times = 2) {
  let last;
  for (let i = 0; i <= times; i++) {
    try { return await fn(); } catch (e) { last = e; if (i === times) throw last; }
  }
}

export const Api = {
  login: (agentId, workerSid, identity) =>
    api.post('/auth/login', { agentId, workerSid, identity }).then((r) => r.data),

  voiceToken: () =>
    retry(() => api.get('/token/voice').then((r) => r.data.token)),

  workerToken: () =>
    retry(() => api.get('/token/tr-worker').then((r) => r.data.token)),

  myTasks: (statuses = 'wrapping,assigned,reserved') =>
    api.get('/taskrouter/my-tasks', { params: { statuses } }).then((r) => r.data),

  completeTask: (taskSid, body = {}) =>
    api.post(`/taskrouter/tasks/${taskSid}/complete`, body).then((r) => r.data),

  availableWorkers: () =>
    api.get('/taskrouter/available-workers').then((r) => r.data),

  transferCold: (payload) =>
    api.post('/transfer/cold', payload).then((r) => r.data), // Handles targetIdentity as 'client:...' or phone number (server-side detection)

  transferWarm: (payload) =>
    api.post('/transfer/warm', payload).then((r) => r.data), // Handles targetIdentity as 'client:...' or phone number (server-side detection)

  transferComplete: (agentCallSid) =>
    api.post('/transfer/complete', { agentCallSid }).then((r) => r.data),

  // Presence & events
  presence: () => api.get('/taskrouter/presence').then(r => r.data),
  recentEvents: () => api.get('/events/recent').then(r => r.data),

  // Hold
  holdStart: (payload) => api.post('/voice/hold/start', payload).then(r => r.data),
  holdStop: (payload) => api.post('/voice/hold/stop', payload).then(r => r.data),

  // Recording
  recStart: (callSid) => api.post('/voice/recordings/start', { callSid }).then(r => r.data),
  recPause: (callSid) => api.post('/voice/recordings/pause', { callSid }).then(r => r.data),
  recResume: (callSid) => api.post('/voice/recordings/resume', { callSid }).then(r => r.data),
  recStop: (callSid) => api.post('/voice/recordings/stop', { callSid }).then(r => r.data),
  recStatus: (callSid) => api.get('/voice/recordings/status', { params: { callSid } }).then(r => r.data.status),

  // --- CRM (BFF proxies) ---
  crmVehicleById: (id) => api.get(`/crm/vehicles/by-id/${id}`).then(r => r.data),
  crmCustomer: (id) => api.get(`/crm/customers/${id}`).then(r => r.data),
  crmVehicleByVin: (vin) => api.get(`/crm/vehicles/${vin}`).then(r => r.data),
  crmVehicleByPlate: (plate) => api.get(`/crm/vehicles/by-plate/${plate}`).then(r => r.data),
  crmAppointments: (vehicleId) => api.get(`/crm/appointments/${vehicleId}`).then(r => r.data),
  crmCreateAppointment: (payload) => api.post(`/crm/appointments`, payload).then(r => r.data),
  crmFinance: (customerId, otpVerified = false) =>
    api.get(`/crm/finance/${customerId}`, { params: { otpVerified } }).then(r => r.data),
  crmPaylink: (customerId) => api.post(`/crm/paylink`, { customerId }).then(r => r.data),
  crmLogInteraction: (payload) => api.post(`/crm/interactions`, payload).then(r => r.data), // Supports holdDuration in payload
  crmInteractions: (customerId) => api.get(`/crm/interactions/${customerId}`).then(r => r.data),

  // Reports (for "Reports" tab)
  reports: () => api.get('/reports').then(r => r.data), // Assume BFF endpoint for aggregated data
};

// Wrappers for React Query caching (used in components)
export const useMyTasks = (statuses) => useQuery({
  queryKey: ['myTasks', statuses],
  queryFn: () => Api.myTasks(statuses),
  staleTime: 10000,
});

export const usePresence = () => useQuery({
  queryKey: ['presence'],
  queryFn: Api.presence,
  staleTime: 10000,
});

// Clear auth on logout (already handled by setAuth(null))
export default Api;