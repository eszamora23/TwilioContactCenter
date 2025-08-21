// contact-center/client/src/components/CardSection.jsx
import { Box } from '@twilio-paste/core/box';

export default function CardSection({ id, title, children }) {
  return (
    <Box id={id} marginBottom="space70">
      <Box
        backgroundColor="colorBackground"
        borderRadius="borderRadius30"
        boxShadow="shadow"
        padding="space70"
      >
        <Box as="h4" margin="space0" fontSize="fontSize40" fontWeight="fontWeightSemibold">
          {title}
        </Box>
        <Box marginTop="space60">{children}</Box>
      </Box>
    </Box>
  );
}
