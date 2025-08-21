import api from './http.js';

export const reports = () => api.get('/reports').then(r => r.data);
