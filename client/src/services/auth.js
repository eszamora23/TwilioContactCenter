import api from './http.js';

export const login = (agentId, workerSid, identity) =>
  api.post('/auth/login', { agentId, workerSid, identity }).then((r) => r.data);
