// contact-center/client/src/softphone/callSidStore.js
let _sid = null;
export const setCallSid = (v) => { _sid = v || null; };
export const getCallSid = () => _sid;
