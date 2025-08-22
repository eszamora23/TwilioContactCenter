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
    >
      {children}
    </Box>
  );
}
