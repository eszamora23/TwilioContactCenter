// contact-center/client/src/main.jsx
import { createRoot } from 'react-dom/client';
import { Theme } from '@twilio-paste/core/theme';
import App from './App.jsx';
import Softphone from './features/softphone/components/Softphone.jsx';
import SoftphoneLayout from './features/softphone/components/SoftphoneLayout.jsx';
import ChatWidget from './chat/ChatWidget.jsx';

const root = createRoot(document.getElementById('root'));

const qp = new URLSearchParams(window.location.search);
const isSoftphonePopup = qp.get('popup') === 'softphone';
const isChatPopup = qp.get('popup') === 'chat';
const chatSid = qp.get('sid');
const remoteOnly = isSoftphonePopup;

root.render(
  <Theme.Provider theme="default">
    {isSoftphonePopup ? (
      // Popup del Softphone en modo remoto
      <SoftphoneLayout>
        <Softphone remoteOnly={remoteOnly} />
      </SoftphoneLayout>
    ) : isChatPopup ? (
      // Popup de Chat (solo el widget)
      <SoftphoneLayout>
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          <ChatWidget
            conversationIdOrUniqueName={chatSid}
            isActive
            onMessageAdded={() => {}}
            onLabel={() => {}}
          />
        </div>
      </SoftphoneLayout>
    ) : (
      <App />
    )}
  </Theme.Provider>
);
