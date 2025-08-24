// contact-center/client/src/features/tasks/hooks/useWorker.js
import { useEffect, useRef, useState } from 'react';
import Api from '../../index.js';
import http from '../../../shared/services/http.js';

export function useWorker() {
  const [worker, setWorker] = useState(null);
  const [activity, setActivity] = useState('');
  const [reservations, setReservations] = useState([]);
  const refreshRef = useRef(null);

  useEffect(() => {
    let w;

    (async () => {
      const token = await Api.workerToken();

      // === Descubre Activities para conectar/desconectar ===
      let connectSid;
      let disconnectSid;
      let offlineName = 'Offline';
      try {
        const acts = await http.get('/taskrouter/activities').then((r) => r.data || []);
        const aAvail = acts.find((a) => /available/i.test(a.name));
        const aOffline = acts.find((a) => /offline/i.test(a.name));
        connectSid = aAvail?.sid;
        disconnectSid = aOffline?.sid;
        offlineName = aOffline?.name || offlineName;
      } catch {
        // si falla, seguimos con constructor sin opciones (funciona igual)
      }

      // === Crea el Worker con opciones de auto-actividad ===
      try {
        // eslint-disable-next-line no-undef
        const opts = {
          closeExistingSessions: true,
          ...(connectSid ? { connectActivitySid: connectSid } : {}),
          ...(disconnectSid ? { disconnectActivitySid: disconnectSid } : {}),
        };
        // Si no hay ninguna opción, igual pasamos el objeto (TaskRouter lo ignora sin error)
        // eslint-disable-next-line no-undef
        w = new Twilio.TaskRouter.Worker(token, opts);
      } catch (e) {
        // Fallback ultra conservador
        // eslint-disable-next-line no-undef
        w = new Twilio.TaskRouter.Worker(token);
      }

      // === Eventos ===
      w.on('ready', (wk) => setActivity((wk || w).activityName));
      w.on('activity.update', (wk) => setActivity((wk || w).activityName));
      // No todos los SDK emiten estos, pero no hacen daño si no existen
      w.on?.('disconnected', () => setActivity(offlineName));
      w.on?.('connected', () => {}); // la actividad correcta llega por 'ready'/'activity.update'

      w.on('reservation.created', (r) => {
        console.log('reservation', r.sid, r.task?.attributes);
        setReservations((prev) => [r, ...prev]);
      });

      w.on('error', (e) => console.error('TR Worker error', e));
      setWorker(w);

      // === Refresh del token (55m) preservando opciones ===
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
              ...(connectSid ? { connectActivitySid: connectSid } : {}),
              ...(disconnectSid ? { disconnectActivitySid: disconnectSid } : {}),
            };
            // eslint-disable-next-line no-undef
            const nw = new Twilio.TaskRouter.Worker(newToken, opts);
            nw.on('ready', (wk) => setActivity((wk || nw).activityName));
            nw.on('activity.update', (wk) => setActivity((wk || nw).activityName));
            nw.on?.('disconnected', () => setActivity(offlineName));
            nw.on('reservation.created', (r) => setReservations((prev) => [r, ...prev]));
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
      clearInterval(refreshRef.current);
      try {
        w && w.disconnect && w.disconnect();
      } catch {}
    };
  }, []);

  // === Cambio de actividad fiable (espera callback) ===
  async function setAvailable(activitySid) {
    if (!worker) return;
    await new Promise((resolve, reject) => {
      try {
        // Firma clásica: update("ActivitySid", sid, callback)
        // Actualiza la UI con el worker actualizado que llega en el callback.
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

  return { worker, activity, reservations, setAvailable };
}
