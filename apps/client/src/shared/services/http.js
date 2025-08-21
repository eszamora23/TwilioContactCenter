import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

const http = axios.create({ baseURL });

export function setAuth(token) {
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete http.defaults.headers.common.Authorization;
    localStorage.removeItem('auth_token');
  }
}

const existing = localStorage.getItem('auth_token');
if (existing) setAuth(existing);

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      setAuth(null);
      window.location.reload();
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
