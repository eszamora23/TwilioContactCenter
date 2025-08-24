// Lee del window.* si existe para permitir overriding desde index.html
export const API_BASE = typeof window !== 'undefined' && window.API_BASE
  ? window.API_BASE
  : 'http://localhost:4000';

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
