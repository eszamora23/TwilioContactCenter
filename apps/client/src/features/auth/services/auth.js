import http from '../../../shared/services/http.js';

export const login = (agentId, workerSid, identity) =>
  http.post('/auth/login', { agentId, workerSid, identity }).then((r) => r.data);

export const logout = () => http.post('/auth/logout');

export const me = () => http.get('/auth/me').then(r => r.data);
