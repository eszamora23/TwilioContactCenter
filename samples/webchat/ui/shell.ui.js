import { byId, qs, qsa } from './dom.js';
import { toast } from './toast.js';
import { API_BASE, DEMO, LS } from '../services/config.js';
import { loadScriptOnce } from '../services/script.loader.js';

// Footer year
try { byId('year').textContent = new Date().getFullYear(); } catch { }

// Theme toggle
byId('toggle-theme')?.addEventListener('click', () => {
  document.body.classList.toggle('light');
  try { localStorage.setItem(LS.THEME, document.body.classList.contains('light') ? 'light' : 'dark'); } catch { }
});
(function () {
  try { const t = localStorage.getItem(LS.THEME); if (t === 'light') document.body.classList.add('light'); } catch { }
})();

// Drawer mobile
const drawer = byId('drawer');
const backdrop = byId('backdrop');
const menuBtn = byId('menuBtn');
function openDrawer() { drawer?.classList.add('open'); backdrop?.classList.add('show'); }
function closeDrawer() { drawer?.classList.remove('open'); backdrop?.classList.remove('show'); }
menuBtn?.addEventListener('click', openDrawer);
backdrop?.addEventListener('click', closeDrawer);

// FAB (Start chat)
byId('fabStart')?.addEventListener('click', () => {
  location.hash = '#chat';
  setTimeout(() => byId('name')?.focus(), 120);
});

// Copy pills (portal)
function hookCopyButtons() {
  qsa('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = btn.getAttribute('data-copy');
      const node = document.querySelector(sel);
      if (node) { navigator.clipboard.writeText(node.textContent).then(() => toast('Copied')); }
    });
  });
}

// Portal fields
(function () {
  const portalInput = byId('agentPortalUrl');
  const openPortal = byId('openPortal');
  const agentIdPill = byId('agentId-pill');
  const workerSidPill = byId('workerSid-pill');
  const identityPill = byId('identity-pill');

  if (portalInput) { portalInput.value = DEMO.agentPortalUrl || portalInput.value; }
  if (agentIdPill) { agentIdPill.textContent = DEMO.agentId; }
  if (workerSidPill) { workerSidPill.textContent = DEMO.workerSid; }
  if (identityPill) { identityPill.textContent = DEMO.identity; }

  if (openPortal) {
    openPortal.addEventListener('click', () => {
      const url = portalInput.value.trim() || DEMO.agentPortalUrl;
      if (!url) return toast('Set the Agent Portal URL first');
      window.open(url, '_blank', 'noopener');
    });
  }
  hookCopyButtons();
})();

// Tabs / Sidebar active
const sections = ['#kb', '#chat', '#agent-portal', '#phone-lab', '#status', '#how'];
const allTargets = sections.map(id => document.querySelector(id)).filter(Boolean);
const sideLinks = qsa('.menu .nav-link');
const tabLinks = qsa('.bottombar .tab');

function setActive(href) {
  sideLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
  tabLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
}
const io = new IntersectionObserver((entries) => {
  entries.filter(e => e.isIntersecting).forEach(e => setActive('#' + e.target.id));
}, {
  root: null,
  rootMargin: `-${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) + 24}px 0px -40% 0px`,
  threshold: 0.3
});
allTargets.forEach(el => io.observe(el));
sideLinks.forEach(a => a.addEventListener('click', closeDrawer));
tabLinks.forEach(a => a.addEventListener('click', () => setActive(a.getAttribute('href'))));

/* ======================================================
   Phone Lab + Softphone (Twilio Voice WebRTC)
   ====================================================== */
let profileSelect = null;
let launchSoftphone = null; // removed button
let startCallBtn = null;
let softWrap = null;

let voiceDevice = null;
let voiceConn = null;
let voiceIdentity = null;
let callTimerInt = null;
let callStartTs = 0;

function regrabPhoneLabNodes() {
  profileSelect = byId('customerProfile');
  launchSoftphone = byId('launchSoftphone'); // not present; kept for no-op compat
  startCallBtn = byId('startCall');
  softWrap = byId('softphoneWrap');
}

function getSelectedProfile() {
  const list = Array.isArray(DEMO.customerProfiles) ? DEMO.customerProfiles : [];
  if (!list.length) return null;
  const selId = profileSelect?.value;
  return list.find(p => p.id === selId) || list[0];
}

function mountInlineSoftphoneUI() {
  if (!softWrap) return;
  // If already mounted, don't duplicate
  if (softWrap.querySelector('#softphonePanel')) return;

  const html = `
    <div id="softphonePanel" style="display:grid;gap:12px;padding:12px">
      <div class="row wrap" style="justify-content:space-between;align-items:center">
        <div class="pill mono" id="sp-status">Idle</div>
        <div class="pill mono" id="sp-timer">00:00</div>
      </div>
      <div class="row wrap" style="gap:8px">
        <button class="btn" id="sp-call" type="button">Call</button>
        <button class="btn" id="sp-hang" type="button" disabled>Hang up</button>
        <button class="btn" id="sp-mute-toggle" type="button" disabled>Mute</button>
        <button class="btn" id="sp-keypad-toggle" type="button">Keypad</button>
      </div>
      <div id="sp-keypad" class="card" style="display:none;padding:12px;border:1px solid var(--stroke);border-radius:12px;background:var(--card)">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${['1','2','3','4','5','6','7','8','9','*','0','#'].map(d=>`<button class="btn" data-digit="${d}" type="button">${d}</button>`).join('')}
        </div>
      </div>
      <div class="row wrap" style="gap:8px">
        <span class="pill mono">From: <span id="sp-from">${DEMO.outboundFromNumber || ''}</span></span>
        <span class="pill mono">To: <span id="sp-to">${DEMO.ivrNumber || ''}</span></span>
      </div>
    </div>
  `;
  softWrap.className = 'iframe-placeholder';
  softWrap.innerHTML = html;

  byId('sp-keypad-toggle')?.addEventListener('click', () => {
    const pad = byId('sp-keypad');
    if (pad) pad.style.display = pad.style.display === 'none' ? 'block' : 'none';
  });
  byId('sp-keypad')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-digit]');
    if (!btn) return;
    const d = btn.getAttribute('data-digit');
    try { voiceConn?.sendDigits?.(d); } catch { }
  });
  byId('sp-call')?.addEventListener('click', startCallFromUI);
  byId('sp-hang')?.addEventListener('click', endWebRTCCall);
  byId('sp-mute-toggle')?.addEventListener('click', () => voiceConn?.mute?.(!isMuted));
}

function syncProfileToFields() {
  if (!profileSelect) return;
  // Select first profile (e.g., Alex Johnson) if none selected yet
  if (profileSelect.options.length && profileSelect.selectedIndex < 0) {
    profileSelect.selectedIndex = 0;
  }
  const p = getSelectedProfile();
  const spFrom = byId('sp-from'); const spTo = byId('sp-to');
  if (spFrom) spFrom.textContent = (p?.callerId || DEMO.outboundFromNumber || '');
  if (spTo) spTo.textContent = (DEMO.ivrNumber || '');
}

function ensureProfilesPopulated() {
  if (!profileSelect) return;
  // Populate from window.DEMO.customerProfiles (set in index.html)
  if (!profileSelect.options.length) {
    (DEMO.customerProfiles || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      profileSelect.appendChild(opt);
    });
  }
  profileSelect.onchange = syncProfileToFields;
  syncProfileToFields();
}

// External softphone launcher removed; keep no-op for compatibility
function wireExternalSoftphone() { return; }

// ===== Voice (Twilio Device) =====
function hasVoiceSDK() { return !!(window.Twilio?.Device || window.Twilio?.Voice?.Device || window.Device); }
async function ensureVoiceSDKLoaded() {
  if (!hasVoiceSDK()) {
    await loadScriptOnce('https://unpkg.com/@twilio/voice-sdk@2.10.1/dist/twilio.min.js');
  }
}
async function fetchVoiceToken(identityHint = 'softphone:alex') {
  const r = await fetch(`${API_BASE}/demo/token/voice?identity=${encodeURIComponent(identityHint)}`);
  if (!r.ok) throw new Error('voice token http ' + r.status);
  return r.json(); // { token, identity }
}
async function ensureVoiceDevice(identityHint) {
  await ensureVoiceSDKLoaded();
  const DeviceCtor = window.Twilio?.Device || window.Twilio?.Voice?.Device || window.Device;
  if (!DeviceCtor) throw new Error('Twilio Voice SDK not loaded');
  if (voiceDevice) return voiceDevice;

  const { token, identity } = await fetchVoiceToken(identityHint);
  voiceIdentity = identity;

  voiceDevice = new DeviceCtor(token, { logLevel: 'error', codecPreferences: ['opus', 'pcmu'] });
  voiceDevice.on('registered', () => setStatus('Ready'));
  voiceDevice.on('error', (e) => { console.error('[Voice] error', e); setStatus('Error'); });
  voiceDevice.on('tokenWillExpire', async () => {
    try {
      const { token: next } = await fetchVoiceToken(identity);
      if (typeof voiceDevice.updateToken === 'function') voiceDevice.updateToken(next);
    } catch (err) { console.warn('[Voice] token refresh failed', err); }
  });

  if (typeof voiceDevice.register === 'function') await voiceDevice.register();
  setStatus('Ready');
  return voiceDevice;
}

function setStatus(label) { const el = byId('sp-status'); if (el) el.textContent = label; }
function setButtons({ calling = false, inCall = false } = {}) {
  const callBtn = byId('sp-call');
  const hangBtn = byId('sp-hang');
  const muteToggle = byId('sp-mute-toggle');
  if (callBtn) callBtn.disabled = calling || inCall;
  if (hangBtn) hangBtn.disabled = !(calling || inCall);
  if (muteToggle) muteToggle.disabled = !inCall;
}
let isMuted = false;
function setMuteLabel() {
  const btn = byId('sp-mute-toggle');
  if (!btn) return;
  btn.textContent = isMuted ? 'Unmute' : 'Mute';
}
function startTimer() {
  callStartTs = Date.now();
  const t = byId('sp-timer');
  clearInterval(callTimerInt);
  callTimerInt = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTs) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    if (t) t.textContent = `${mm}:${ss}`;
  }, 1000);
}
function stopTimer() { clearInterval(callTimerInt); const t = byId('sp-timer'); if (t) t.textContent = '00:00'; }

function wireConnectionEvents(conn) {
  conn.on('accept', () => {
    setStatus('In call'); setButtons({ calling: false, inCall: true }); startTimer();
    isMuted = typeof conn.isMuted === 'function' ? !!conn.isMuted() : false;
    setMuteLabel();
  });
  conn.on('mute', (muted) => {
    isMuted = !!muted;
    setStatus(isMuted ? 'Muted' : 'In call');
    setMuteLabel();
  });
  conn.on('reject', () => { setStatus('Rejected'); setButtons({ calling: false, inCall: false }); stopTimer(); voiceConn = null; });
  conn.on('disconnect', () => { setStatus('Idle'); setButtons({ calling: false, inCall: false }); stopTimer(); voiceConn = null; });
  conn.on('error', (e) => { console.error('[VoiceConn] error', e); setStatus('Error'); setButtons({ calling: false, inCall: false }); stopTimer(); });
}

async function startWebRTCCall({ to, from }) {
  await ensureVoiceSDKLoaded();
  const DeviceCtor = window.Twilio?.Device || window.Twilio?.Voice?.Device || window.Device;
  if (!DeviceCtor) throw new Error('Twilio Voice SDK not loaded');

  const dev = await ensureVoiceDevice('softphone:alex');
  setStatus('Calling…'); setButtons({ calling: true, inCall: false });

  const maybe = dev.connect({ params: { To: to, callerId: from } });
  const conn = (maybe && typeof maybe.then === 'function') ? await maybe : maybe;
  if (!conn || typeof conn.on !== 'function') {
    throw new Error('connect() did not return a Call instance');
  }
  voiceConn = conn;
  wireConnectionEvents(conn);
}

function endWebRTCCall() {
  try {
    if (voiceConn?.disconnect) voiceConn.disconnect();
    else if (voiceDevice?.disconnectAll) voiceDevice.disconnectAll();
  } catch { }
  voiceConn = null;
  setStatus('Idle'); setButtons({ calling: false, inCall: false }); stopTimer();
}

async function startCallFromUI() {
  const p = getSelectedProfile();
  const to = (DEMO.ivrNumber || '').trim();
  const from = (p?.callerId || DEMO.outboundFromNumber || '').trim();

  const ALLOWED_TO = ['+12058275832']; // demo safeguard
  if (!ALLOWED_TO.includes(to)) return toast('Por ahora sólo: +12058275832');

  try {
    if (await (async () => { await ensureVoiceSDKLoaded(); return true; })()) {
      await startWebRTCCall({ to, from });
      // Smooth-scroll the user to the embedded softphone
      try { document.getElementById('softphoneWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      return;
    }
  } catch (err) {
    console.error('[WebRTC] init/connect failed → falling back to REST', err);
  }

  try {
    const res = await fetch(`${API_BASE}/demo/call/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, from })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast(`Call started → ${to} as ${from}`);
    setStatus('Server call (no WebRTC)');
    try { document.getElementById('softphoneWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  } catch (err) {
    console.error('[REST fallback] failed:', err);
    toast('Could not start the call');
    setStatus('Error');
  }
}

function hydratePhoneLab() {
  regrabPhoneLabNodes();
  mountInlineSoftphoneUI();
  ensureProfilesPopulated();
  // Wire Start call button once
  if (startCallBtn && startCallBtn.dataset.wired !== '1') {
    startCallBtn.dataset.wired = '1';
    startCallBtn.addEventListener('click', startCallFromUI);
  }
  wireExternalSoftphone(); // no-op
}

// Re-sync on anchor nav
window.addEventListener('hashchange', () => {
  if (location.hash === '#phone-lab') hydratePhoneLab();
  if (location.hash === '#status') refreshStatus();
});

/* =========================
   Service Status checks
   ========================= */
function wireStatusButton() {
  const btnRefresh = byId('refresh-status');
  if (btnRefresh && btnRefresh.dataset.wired !== '1') {
    btnRefresh.dataset.wired = '1';
    btnRefresh.addEventListener('click', refreshStatus);
  }
}

async function refreshStatus() {
  const kHealth = byId('kpi-health');
  const kAgents = byId('kpi-agents');
  const kVideo = byId('kpi-video');
  if (!kHealth || !kAgents || !kVideo) return;

  try {
    const h = await fetch(`${API_BASE}/api/health`).then(r => r.json()).catch(() => ({ ok: false }));
    kHealth.textContent = h && h.ok ? 'OK' : 'Down';

    // presence: try private then fallback to public if 401/403
    let pres = [];
    try {
      let r = await fetch(`${API_BASE}/api/taskrouter/presence`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) {
        r = await fetch(`${API_BASE}/api/taskrouter/presence/public`);
      }
      pres = await r.json().catch(() => []);
    } catch { }
    const online = Array.isArray(pres) ? pres.filter(x => x.available).length : 0;
    kAgents.textContent = String(online);

    const v = await fetch(`${API_BASE}/api/video/enabled`).then(r => r.json()).catch(() => ({ enabled: false }));
    kVideo.textContent = v && v.enabled ? 'Enabled' : 'Disabled';
  } catch {
    kHealth.textContent = '—'; kAgents.textContent = '—'; kVideo.textContent = '—';
  }
}

// Partials ready (handle race where event fired before this script was loaded)
function bootAfterPartials() {
  hydratePhoneLab();
  wireStatusButton();
  refreshStatus();
}
if (window.__partialsReady) {
  bootAfterPartials();
} else {
  window.addEventListener('partials:ready', bootAfterPartials);
}
