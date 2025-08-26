// contact-center/client/src/features/tasks/hooks/useWorker.js
import { useEffect, useRef, useState } from 'react';
import Api from '../../index.js';
import http from '../../../shared/services/http.js';

export function useWorker() {
  const [worker, setWorker] = useState(null);
  const [activity, setActivity] = useState('');
  const [reservations, setReservations] = useState([]);

  // Expose discovered SIDs to consumers (e.g., for explicit Offline on logout)
  const [availableSidState, setAvailableSidState] = useState(null);
  const [offlineSidState, setOfflineSidState] = useState(null);

  // Refs used inside timers/closures
  const availableSidRef = useRef(null);
  const offlineSidRef = useRef(null);
  const refreshRef = useRef(null);

  useEffect(() => {
    let w;

    (async () => {
      const token = await Api.workerToken();

      // === Discover Activities for auto connect/disconnect ===
      let offlineName = 'Offline';
      try {
        const acts = await http.get('/taskrouter/activities').then((r) => r.data || []);
        const aAvail = acts.find((a) => /available/i.test(a.name));
        const aOffline = acts.find((a) => /offline/i.test(a.name));

        availableSidRef.current = aAvail?.sid || null;
        offlineSidRef.current = aOffline?.sid || null;
        offlineName = aOffline?.name || offlineName;

        // publish to state so callers can use them
        setAvailableSidState(availableSidRef.current);
        setOfflineSidState(offlineSidRef.current);
      } catch {
        // If it fails, we still build the Worker without these hints.
      }

      // === Create Worker with auto-activity opts (if known) ===
      try {
        // eslint-disable-next-line no-undef
        const opts = {
          closeExistingSessions: true,
          ...(availableSidRef.current ? { connectActivitySid: availableSidRef.current } : {}),
          ...(offlineSidRef.current ? { disconnectActivitySid: offlineSidRef.current } : {}),
        };
        // eslint-disable-next-line no-undef
        w = new Twilio.TaskRouter.Worker(token, opts);
      } catch {
        // Ultra-conservative fallback
        // eslint-disable-next-line no-undef
        w = new Twilio.TaskRouter.Worker(token);
      }

      // === Events ===
      w.on('ready', (wk) => setActivity((wk || w).activityName));
      w.on('activity.update', (wk) => setActivity((wk || w).activityName));
      // Some SDK builds emit these; harmless if not
      w.on?.('disconnected', () => setActivity(offlineName));
      w.on?.('connected', () => {}); // the accurate activity arrives via ready/activity.update

      w.on('reservation.created', (r) => {
        console.log('reservation', r.sid, r.task?.attributes);
        setReservations((prev) => [r, ...prev]);
      });

      // === Added listeners for faster incident diagnosis ===
      w.on('reservation.canceled', (r) => {
        try {
          console.warn('[TR] reservation.canceled', r.sid, {
            reason: r.canceledReason || r.reason || r?.data?.reason || 'unknown',
            to:
              (r.task?.attributes &&
                JSON.parse(r.task.attributes || '{}').selected_contact_uri) || null,
          });
        } catch (e) {
          console.warn('[TR] reservation.canceled', r.sid);
        }
      });

      w.on('reservation.timeout', (r) => {
        console.warn('[TR] reservation.timeout', r.sid);
      });

      w.on('error', (e) => console.error('TR Worker error', e));
      setWorker(w);

      // === Token refresh (55m), preserving options ===
      refreshRef.current = setInterval(async () => {
        try {
          const newToken = await Api.workerToken();
          if (typeof w.updateToken === 'function') {
            w.updateToken(newToken);
          } else {
            const prev = w;
            // eslint-disable-next-line no-undef
            const opts = {
              closeExistingSessions: true,
              ...(availableSidRef.current ? { connectActivitySid: availableSidRef.current } : {}),
              ...(offlineSidRef.current ? { disconnectActivitySid: offlineSidRef.current } : {}),
            };
            // eslint-disable-next-line no-undef
            const nw = new Twilio.TaskRouter.Worker(newToken, opts);
            nw.on('ready', (wk) => setActivity((wk || nw).activityName));
            nw.on('activity.update', (wk) => setActivity((wk || nw).activityName));
            nw.on?.('disconnected', () => setActivity(offlineName));
            nw.on('reservation.created', (r) => setReservations((prev) => [r, ...prev]));

            // === Added listeners mirrored for refreshed worker ===
            nw.on('reservation.canceled', (r) => {
              try {
                console.warn('[TR] reservation.canceled', r.sid, {
                  reason: r.canceledReason || r.reason || r?.data?.reason || 'unknown',
                  to:
                    (r.task?.attributes &&
                      JSON.parse(r.task.attributes || '{}').selected_contact_uri) || null,
                });
              } catch (e) {
                console.warn('[TR] reservation.canceled', r.sid);
              }
            });

            nw.on('reservation.timeout', (r) => {
              console.warn('[TR] reservation.timeout', r.sid);
            });

            nw.on('error', (e) => console.error('TR Worker error', e));
            setWorker(nw);
            try {
              prev?.disconnect?.();
            } catch {}
            w = nw;
          }
        } catch (e) {
          console.error('Worker token refresh failed', e);
        }
      }, 55 * 60 * 1000);
    })();

    return () => {
      try {
        clearInterval(refreshRef.current);
      } catch {}
      try {
        w && w.disconnect && w.disconnect();
      } catch {}
    };
  }, []);

  // === Reliable activity change (waits for callback) ===
  async function setAvailable(activitySid) {
    if (!worker) return;
    await new Promise((resolve, reject) => {
      try {
        // Classic signature: update("ActivitySid", sid, cb)
        worker.update('ActivitySid', activitySid, (err, updated) => {
          if (err) return reject(err);
          try {
            setActivity(updated?.activityName ?? worker.activityName);
          } catch {}
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  return {
    worker,
    activity,
    reservations,
    setAvailable,
    // expose current discovered SIDs to consumers (e.g., logout → set Offline)
    sids: { availableSid: availableSidState, offlineSid: offlineSidState },
  };
}
