import http from '../../../shared/services/http.js';

export const reports = () => http.get('/reports').then((r) => r.data);
