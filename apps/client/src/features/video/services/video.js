// contact-center/client/src/features/video/services/video.js
import http from '../../../shared/services/http.js';

export const isEnabled = () =>
  http.get('/video/enabled').then(r => !!r.data.enabled);

export const ensureRoom = (payload) =>
  http.post('/video/ensure-room', payload).then(r => r.data);

export const videoTokenAgent = (roomName) =>
  http.get('/video/token', { params: { roomName } }).then(r => r.data.token);
