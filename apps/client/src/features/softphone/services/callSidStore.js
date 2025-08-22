// contact-center/client/src/softphone/callSidStore.js
let _sid = null;
const KEY = 'callSid';

// Sync _sid when another tab updates the value
try {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      _sid = e.newValue || null;
    }
  });
} catch {}

export const setCallSid = (v) => {
  _sid = v || null;
  try {
    if (_sid) window.localStorage.setItem(KEY, _sid);
    else window.localStorage.removeItem(KEY);
  } catch {}
};

export const getCallSid = () => {
  if (_sid) return _sid;
  try {
    _sid = window.localStorage.getItem(KEY) || null;
  } catch {}
  return _sid;
};
