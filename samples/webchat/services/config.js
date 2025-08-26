// Base del API (origen). Acepta sin /api y le agregamos helpers ya normalizados.
const RAW_BASE = (typeof window !== 'undefined' && window.API_BASE)
  ? window.API_BASE
  : 'http://localhost:4000';
export const API_BASE = RAW_BASE.replace(/\/+$/, '');
export const API_BASE_API = `${API_BASE}/api`;
export const DEMO_BASE = `${API_BASE_API}/demo`; // <-- usamos /api/demo siempre
export const DEMO = typeof window !== 'undefined' && window.DEMO
  ? window.DEMO
  : {
      agentPortalUrl: '',
      agentId: 'demo-agent-1',
      workerSid: 'WKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      identity: 'client:agent:demo-agent-1',
      softphoneUrl: '',
      ivrNumber: '+15555550123',
      outboundFromNumber: '+15555550199',
      customerProfiles: []
    };

export const LS = {
  NAME: 'wxs_name',
  EMAIL: 'wxs_email',
  IDENTITY: 'wxs_guest_identity',
  CONVO: 'wxs_conversation_sid',
  VIDEO_ACTIVE: 'wxs_video_active',
  THEME: 'wxs_theme'
};
