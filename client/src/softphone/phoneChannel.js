// contact-center/client/src/softphone/phoneChannel.js
/**
 * Minimal cross-window bus.
 * Prefers BroadcastChannel (same-origin). Falls back to postMessage.
 */
export function createPhoneChannel(name = 'softphone-bus') {
  if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel(name);
    return {
      send(type, payload) { bc.postMessage({ type, payload }); },
      on(handler) {
        const fn = (e) => handler(e.data || {});
        bc.addEventListener('message', fn);
        return () => bc.removeEventListener('message', fn);
      },
      close() { try { bc.close(); } catch {} }
    };
  }

  // Fallback: same-window postMessage (works with popup reference too, but BC is widely supported)
  const listeners = new Set();
  const fn = (e) => {
    const msg = e?.data;
    if (!msg || !msg.__softphone) return;
    listeners.forEach((h) => h(msg.data));
  };
  window.addEventListener('message', fn);

  return {
    send(type, payload) {
      window.postMessage({ __softphone: true, data: { type, payload } }, '*');
    },
    on(handler) { listeners.add(handler); return () => listeners.delete(handler); },
    close() { window.removeEventListener('message', fn); listeners.clear(); }
  };
}
