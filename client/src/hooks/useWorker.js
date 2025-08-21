// contact-center/client/src/hooks/useWorker.js
import { useEffect, useRef, useState } from 'react';
import { workerToken } from '../services/taskRouter.js';

export function useWorker() {
  const [worker, setWorker] = useState(null);
  const [activity, setActivity] = useState('');
  const [reservations, setReservations] = useState([]);
  const refreshRef = useRef(null);

  useEffect(() => {
    let w;

    (async () => {
      const token = await workerToken();
      // eslint-disable-next-line no-undef
      w = new Twilio.TaskRouter.Worker(token);

      w.on('ready', () => setActivity(w.activityName));
      w.on('activity.update', () => setActivity(w.activityName));
      w.on('reservation.created', (r) => {
        console.log('reservation', r.sid, r.task?.attributes);
        setReservations((prev) => [r, ...prev]);
      });
      w.on('error', (e) => console.error('TR Worker error', e));

      setWorker(w);

      refreshRef.current = setInterval(async () => {
        try {
          const newToken = await workerToken();
          if (typeof w.updateToken === 'function') {
            w.updateToken(newToken);
          } else {
            const prev = w;
            // eslint-disable-next-line no-undef
            const nw = new Twilio.TaskRouter.Worker(newToken);
            nw.on('ready', () => setActivity(nw.activityName));
            nw.on('activity.update', () => setActivity(nw.activityName));
            nw.on('reservation.created', (r) =>
              setReservations((prev) => [r, ...prev])
            );
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

  async function setAvailable(activitySid) {
    await worker?.update({ ActivitySid: activitySid });
  }

  return { worker, activity, reservations, setAvailable };
}
