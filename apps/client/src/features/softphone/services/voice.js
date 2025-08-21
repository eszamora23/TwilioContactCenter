import http, { retry } from '../../../shared/services/http.js';

export const voiceToken = () =>
  retry(() => http.get('/token/voice').then((r) => r.data.token));

export const transferCold = (payload) =>
  http.post('/transfer/cold', payload).then((r) => r.data);

export const transferWarm = (payload) =>
  http.post('/transfer/warm', payload).then((r) => r.data);

export const transferComplete = (agentCallSid) =>
  http.post('/transfer/complete', { agentCallSid }).then((r) => r.data);

export const holdStart = (payload) =>
  http.post('/voice/hold/start', payload).then((r) => r.data);

export const holdStop = (payload) =>
  http.post('/voice/hold/stop', payload).then((r) => r.data);

export const hangup = (callSid) =>
  http.post('/voice/hangup', { callSid }).then((r) => r.data);

export const recStart = (callSid) =>
  http.post('/voice/recordings/start', { callSid }).then((r) => r.data);

export const recPause = (callSid) =>
  http.post('/voice/recordings/pause', { callSid }).then((r) => r.data);

export const recResume = (callSid) =>
  http.post('/voice/recordings/resume', { callSid }).then((r) => r.data);

export const recStop = (callSid) =>
  http.post('/voice/recordings/stop', { callSid }).then((r) => r.data);

export const recStatus = (callSid) =>
  http.get('/voice/recordings/status', { params: { callSid } }).then((r) => r.data.status);
