import http from './http.js';

export const reports = () => http.get('/reports').then((r) => r.data);
