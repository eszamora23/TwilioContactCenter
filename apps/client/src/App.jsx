// contact-center/client/src/App.jsx
import { useState } from 'react';
import { IdleTimerProvider } from 'react-idle-timer';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from './i18n.js';
import Api from './features/index.js';
import Login from './features/auth/components/Login.jsx';
import AgentApp from './features/tasks/components/AgentApp.jsx';
const queryClient = new QueryClient();

export default function App() {
  const [ctx, setCtx] = useState(null);
  if (!ctx) return <Login onReady={setCtx} />;

  const onIdle = async () => {
    await Api.logout();
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
