import api, { retry } from './http.js';

export const voiceToken = () =>
  retry(() => api.get('/token/voice').then((r) => r.data.token));

export const transferCold = (payload) =>
  api.post('/transfer/cold', payload).then((r) => r.data);
export const transferWarm = (payload) =>
  api.post('/transfer/warm', payload).then((r) => r.data);
export const transferComplete = (agentCallSid) =>
  api.post('/transfer/complete', { agentCallSid }).then((r) => r.data);

export const holdStart = (payload) =>
  api.post('/voice/hold/start', payload).then((r) => r.data);
export const holdStop = (payload) =>
  api.post('/voice/hold/stop', payload).then((r) => r.data);

export const recStart = (callSid) =>
  api.post('/voice/recordings/start', { callSid }).then((r) => r.data);
export const recPause = (callSid) =>
  api.post('/voice/recordings/pause', { callSid }).then((r) => r.data);
export const recResume = (callSid) =>
  api.post('/voice/recordings/resume', { callSid }).then((r) => r.data);
export const recStop = (callSid) =>
  api.post('/voice/recordings/stop', { callSid }).then((r) => r.data);
export const recStatus = (callSid) =>
  api.get('/voice/recordings/status', { params: { callSid } }).then((r) => r.data.status);
