// contact-center/client/src/main.jsx
import { createRoot } from 'react-dom/client';
import { Theme } from '@twilio-paste/core/theme';
import App from './App.jsx';
import Softphone from './features/softphone/components/Softphone.jsx';

const root = createRoot(document.getElementById('root'));

const isSoftphonePopup = new URLSearchParams(window.location.search).get('popup') === 'softphone';
const remoteOnly = isSoftphonePopup;

root.render(
  <Theme.Provider theme="default">
    {remoteOnly ? (
      // Popup renders the Softphone in remoteOnly mode
      <div style={{ minHeight: '100vh', background: 'var(--paste-color-background-body)', padding: '16px' }}>
        <Softphone remoteOnly={remoteOnly} />
      </div>
    ) : (
      <App />
    )}
  </Theme.Provider>
);
