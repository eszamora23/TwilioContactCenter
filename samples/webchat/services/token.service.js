import { API_BASE } from './config.js';
import { SessionStore } from './session.store.js';

async function fetchWithTimeout(url, opts={}, timeoutMs=7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally { clearTimeout(t); }
}

export async function fetchGuestToken() {
  const identity = SessionStore.identity;
  const identityQs = identity ? `?identity=${encodeURIComponent(identity)}` : '';
  const url = `${API_BASE}/api/chat/${identity ? 'refresh' : 'token'}/guest${identityQs}`;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchWithTimeout(url, {}, 7000);
      if (!res.ok) throw new Error(`Token http ${res.status}`);
      const data = await res.json();
      if (data.identity) SessionStore.identity = data.identity; // e.g., guest:uuid
      return data.token;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 200 * (2 ** i)));
    }
  }
  throw lastErr || new Error('Token error');
}
