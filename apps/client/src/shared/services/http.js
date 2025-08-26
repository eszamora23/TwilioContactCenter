import axios from 'axios';
// Garantiza sufijo /api aunque VITE_API_BASE venga sin él
const RAW = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const baseURL = RAW.endsWith('/api') ? RAW : `${RAW.replace(/\/+$/, '')}/api`;

const http = axios.create({ baseURL, withCredentials: true });

let refreshPromise = null;

http.interceptors.response.use(
  (r) => r,
  async (err) => {
    const { response, config } = err || {};
    if (response?.status === 401 && !config._retry && config.url !== '/auth/refresh') {
      config._retry = true;
      try {
        refreshPromise = refreshPromise || http.post('/auth/refresh');
        await refreshPromise;
        refreshPromise = null;
        return http(config);
      } catch {
        refreshPromise = null;
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export async function retry(fn, times = 2) {
  let last;
  for (let i = 0; i <= times; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === times) throw last;
    }
  }
}

export default http;
