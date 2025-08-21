import http from '../../../shared/services/http.js';

export const login = (agentId, workerSid, identity) =>
  http.post('/auth/login', { agentId, workerSid, identity }).then((r) => r.data);
