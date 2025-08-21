import { Button } from '@twilio-paste/core/button';

export default function PopoutButton({ onClick }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      Pop out
    </Button>
  );
}
