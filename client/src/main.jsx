import { createRoot } from 'react-dom/client';
import { Theme } from '@twilio-paste/core/theme';
import { Box } from '@twilio-paste/core/box';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <Theme.Provider theme="default">
    <Box minHeight="100vh" backgroundColor="colorBackgroundBody" padding={['space70','space120']}>
      <App />
    </Box>
  </Theme.Provider>
);
