import { Button } from '@twilio-paste/core/button';

export default function PopOutButton({ onClick }) {
  return (
    <Button variant="secondary" onClick={onClick}>Pop out</Button>
  );
}
