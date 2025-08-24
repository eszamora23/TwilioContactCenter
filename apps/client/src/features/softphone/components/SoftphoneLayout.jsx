/* src/features/softphone/components/SoftphoneLayout.jsx */
import { Box } from '@twilio-paste/core/box';
import styles from './Softphone.module.css';

export default function SoftphoneLayout({ children }) {
  return (
    <Box
      backgroundColor="colorBackground"
      borderRadius="borderRadius30"
      boxShadow="shadow"
      padding="space70"
      className={styles.layout}
      minHeight="100vh"
      height="100vh"
      style={{ overflowX: 'hidden' }}
    >
      {/* prevent any sideways scroll in popouts */}
      {children}
    </Box>
  );
}
