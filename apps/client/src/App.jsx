// contact-center/client/src/App.jsx
import { useEffect, useState } from 'react';
import { IdleTimerProvider } from 'react-idle-timer';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from './i18n.js';
import Api from './features/index.js';
import Login from './features/auth/components/Login.jsx';
import AgentApp from './features/tasks/components/AgentApp.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
      gcTime: 5 * 60 * 1000,
    },
  },
});

export default function App() {
  // 1) Hidrata desde localStorage inmediatamente (evita flash del login)
  const [ctx, setCtx] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('agent_ctx') || 'null');
      return saved && saved.agent ? saved : null;
    } catch { return null; }
  });

  // 2) Valida sesión con el backend y refresca el ctx guardado
  useEffect(() => {
    Api.me()
      .then((data) => {
        if (data?.agent) {
          const next = { agent: data.agent };
          setCtx(next);
          try { localStorage.setItem('agent_ctx', JSON.stringify(next)); } catch {}
        }
      })
      .catch(() => {
        // Si hay ctx local lo mantenemos; si no, se verá el login.
      });
  }, []);

  if (!ctx) return <Login onReady={(data) => {
    setCtx(data);
    try { localStorage.setItem('agent_ctx', JSON.stringify(data)); } catch {}
  }} />;

  const onIdle = async () => {
    await Api.logout();
    try { localStorage.removeItem('agent_ctx'); } catch {}
    window.location.reload();
  };

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <IdleTimerProvider timeout={15 * 60 * 1000} onIdle={onIdle}>
          <AgentApp />
        </IdleTimerProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
