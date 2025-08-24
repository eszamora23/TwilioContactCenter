import { API_BASE } from './config.js';
import { SessionStore } from './session.store.js';

export async function fetchGuestToken() {
  const identity = SessionStore.identity;
  const identityQs = identity ? `?identity=${encodeURIComponent(identity)}` : '';
  const url = `${API_BASE}/api/chat/${identity ? 'refresh' : 'token'}/guest${identityQs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Token error: ${res.status}`);
  const data = await res.json();
  if (data.identity) SessionStore.identity = data.identity; // e.g., guest:uuid
  return data.token;
}
