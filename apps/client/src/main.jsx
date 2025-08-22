// contact-center/client/src/main.jsx
import { createRoot } from 'react-dom/client';
import { Theme } from '@twilio-paste/core/theme';
import App from './App.jsx';
import Softphone from './features/softphone/components/Softphone.jsx';
import SoftphoneLayout from './features/softphone/components/SoftphoneLayout.jsx';

const root = createRoot(document.getElementById('root'));

const isSoftphonePopup = new URLSearchParams(window.location.search).get('popup') === 'softphone';
const remoteOnly = isSoftphonePopup;

root.render(
  <Theme.Provider theme="default">
    {remoteOnly ? (
      // Popup renders the Softphone in remoteOnly mode
      <SoftphoneLayout>
        <Softphone remoteOnly={remoteOnly} />
      </SoftphoneLayout>
    ) : (
      <App />
    )}
  </Theme.Provider>
);
