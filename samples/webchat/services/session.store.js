import { LS } from './config.js';

export const SessionStore = {
  get identity() { try { return localStorage.getItem(LS.IDENTITY); } catch { return null; } },
  set identity(v){ try { v ? localStorage.setItem(LS.IDENTITY, v) : localStorage.removeItem(LS.IDENTITY); } catch {} },

  get convoSid() { try { return localStorage.getItem(LS.CONVO); } catch { return null; } },
  set convoSid(v){ try { v ? localStorage.setItem(LS.CONVO, v) : localStorage.removeItem(LS.CONVO); } catch {} },

  get videoActive(){ try { return !!localStorage.getItem(LS.VIDEO_ACTIVE); } catch { return false; } },
  set videoActive(on){ try { on ? localStorage.setItem(LS.VIDEO_ACTIVE, '1') : localStorage.removeItem(LS.VIDEO_ACTIVE); } catch {} },

  get name(){ try { return localStorage.getItem(LS.NAME); } catch { return ''; } },
  set name(v){ try { v ? localStorage.setItem(LS.NAME, v) : localStorage.removeItem(LS.NAME); } catch {} },

  get email(){ try { return localStorage.getItem(LS.EMAIL); } catch { return ''; } },
  set email(v){ try { v ? localStorage.setItem(LS.EMAIL, v) : localStorage.removeItem(LS.EMAIL); } catch {} },

  clearExceptProfile(){
    try {
      localStorage.removeItem(LS.CONVO);
      localStorage.removeItem(LS.IDENTITY);
      localStorage.removeItem(LS.VIDEO_ACTIVE);
    } catch {}
  }
};
