import useSoftphone from '../hooks/useSoftphone.js';

export default function useCallControls(softphone) {
  const sp = softphone || useSoftphone(true);

  const {
    callStatus,
    isMuted,
    holding,
    recStatus,
    hangup,
    toggleMute,
    holdStart,
    holdStop,
    recStart,
    recPause,
    recResume,
    recStop,
  } = sp;

  return {
    callStatus,
    isMuted,
    holding,
    recStatus,
    hangup,
    toggleMute,
    holdStart,
    holdStop,
    recStart,
    recPause,
    recResume,
    recStop,
  };
}
