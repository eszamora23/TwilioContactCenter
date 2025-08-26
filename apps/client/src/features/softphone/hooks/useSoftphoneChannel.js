// src/features/softphone/hooks/useSoftphoneChannel.js
import { useEffect, useRef, useCallback } from 'react';
import useLocalStorage from '../../../shared/hooks/useLocalStorage.js';
import { SOFTPHONE_CHANNEL_KEY } from '../constants.js';

export function useSoftphoneChannel({
  isPopup = false,
  onStateUpdate,
  onPopupClosed,
  onAckReceived,
} = {}) {
  const [softphonePrefRaw, setSoftphonePref] = useLocalStorage('softphone_popout', false);
  const isSoftphonePopout = softphonePrefRaw === true || softphonePrefRaw === 'true';

  const channelRef = useRef(null);
  const storageHandlerRef = useRef(null);
  const ackedRef = useRef(false);

  const postToChannel = useCallback((type, payload = {}) => {
    const msg = { type, payload, ts: Date.now() };
    try {
      const ch = channelRef.current;
      if (ch && typeof ch.postMessage === 'function') {
        ch.postMessage(msg);
      } else {
        // Fallback: storage broadcast
        localStorage.setItem(SOFTPHONE_CHANNEL_KEY, JSON.stringify(msg));
      }
    } catch {
      // If BC is closed or throws, try storage fallback
      try {
        localStorage.setItem(SOFTPHONE_CHANNEL_KEY, JSON.stringify(msg));
      } catch {}
    }
  }, []);

  useEffect(() => {
    let bc = null;

    const onMsg = (evt) => {
      const { type, payload } = evt?.data || {};

      if (type === 'state') {
        onStateUpdate?.(payload);
        // Consider first inbound state as ACK (breaks “checking…” loops)
        if (!ackedRef.current) {
          ackedRef.current = true;
          onAckReceived?.();
        }
        return;
      }

      if (type === 'popup-closed') {
        onPopupClosed?.();
        return;
      }

      if (type === 'cmd') {
        const action = payload?.action;

        // Handshake:
        // - POPUP replies to 'ping' with 'pong'
        // - MAIN treats 'ping' as ACK too
        if (action === 'ping') {
          if (isPopup) {
            try { postToChannel('cmd', { action: 'pong' }); } catch {}
          }
          if (!ackedRef.current) {
            ackedRef.current = true;
            onAckReceived?.();
          }
          return;
        }

        // ACKs
        if (action === 'pong' || action === 'ready') {
          if (!ackedRef.current) {
            ackedRef.current = true;
            onAckReceived?.();
          }
          return;
        }

        if (action === 'close' && isPopup) {
          try { window.close(); } catch {}
          return;
        }
      }
    };

    const installStorageFallback = () => {
      if (storageHandlerRef.current) return;
      const storageHandler = (e) => {
        if (e.key === SOFTPHONE_CHANNEL_KEY && e.newValue) {
          try { onMsg({ data: JSON.parse(e.newValue) }); } catch {}
        }
      };
      window.addEventListener('storage', storageHandler);
      storageHandlerRef.current = storageHandler;

      channelRef.current = {
        postMessage: (data) => {
          try {
            localStorage.setItem(
              SOFTPHONE_CHANNEL_KEY,
              JSON.stringify({ ...(data || {}), ts: Date.now() })
            );
          } catch {}
        },
        close: () => {
          if (storageHandlerRef.current) {
            window.removeEventListener('storage', storageHandlerRef.current);
            storageHandlerRef.current = null;
          }
        },
      };
    };

    // Prefer BroadcastChannel, fallback to storage
    if (typeof BroadcastChannel === 'function') {
      try {
        bc = new BroadcastChannel(SOFTPHONE_CHANNEL_KEY);
        bc.onmessage = onMsg;
        channelRef.current = bc;
      } catch {
        installStorageFallback();
      }
    } else {
      installStorageFallback();
    }

    // POPUP announces readiness once
    if (isPopup) {
      try { postToChannel('cmd', { action: 'ready' }); } catch {}
    }

    return () => {
      if (isPopup) {
        try { postToChannel('popup-closed'); } catch {}
      }
      try { channelRef.current?.close?.(); } catch {}
      if (storageHandlerRef.current) {
        window.removeEventListener('storage', storageHandlerRef.current);
        storageHandlerRef.current = null;
      }
      channelRef.current = null;
      ackedRef.current = false;
    };
  }, [isPopup, postToChannel, onStateUpdate, onPopupClosed, onAckReceived]);

  return { postToChannel, isSoftphonePopout, setSoftphonePref };
}
