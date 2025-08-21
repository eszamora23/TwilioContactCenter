// contact-center/client/src/main.jsx
import { createRoot } from 'react-dom/client';
import { Theme } from '@twilio-paste/core/theme';
import App from './App.jsx';
import Softphone from './features/softphone/components/Softphone.jsx';

const root = createRoot(document.getElementById('root'));

const isSoftphonePopup = window.location.hash === '#softphone-host';

root.render(
  <Theme.Provider theme="default">
    {isSoftphonePopup ? (
      // Popup renders the Softphone in remoteOnly mode
      <div style={{ minHeight: '100vh', background: 'var(--paste-color-background-body)', padding: '16px' }}>
        <Softphone remoteOnly />
      </div>
    ) : (
      <App />
    )}
  </Theme.Provider>
);
