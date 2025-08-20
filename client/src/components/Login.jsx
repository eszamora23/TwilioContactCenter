// contact-center/client/src/components/Login.jsx
import { useState } from 'react';
import Api, { setAuth } from '../api.js';

import { Box } from '@twilio-paste/core/box';
import { Heading } from '@twilio-paste/core/heading';
import { Input } from '@twilio-paste/core/input';
import { Label } from '@twilio-paste/core/label';
import { Button } from '@twilio-paste/core/button';
import { Stack } from '@twilio-paste/core/stack';
import { Card } from '@twilio-paste/core/card';
import { Callout, CalloutHeading, CalloutText } from '@twilio-paste/core/callout';
export default function Login({ onReady }) {
  const [agentId, setAgentId] = useState('42');
  const [workerSid, setWorkerSid] = useState('WK7e59fecd3f4064d7b1bd8cb9e7e7c49c');
  const [identity, setIdentity] = useState('client:agent:42');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await Api.login(agentId, workerSid, identity);
      setAuth(data.token);
      onReady({ agent: data.agent });
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    }
  }

  return (
    <Box maxWidth="420px" marginX="auto">
      {error ? (
        <Callout variant="error" marginBottom="space60">
          <CalloutHeading>Login error</CalloutHeading>
          <CalloutText>{error}</CalloutText>
        </Callout>
      ) : null}

      <Card padding="space70">
        <Heading as="h3" variant="heading30" marginBottom="space70">Sign in</Heading>
        <Box as="form" onSubmit={submit}>
          <Stack orientation="vertical" spacing="space70">
            <Box>
              <Label htmlFor="agentId">Agent ID</Label>
              <Input id="agentId" value={agentId} onChange={e => setAgentId(e.target.value)} />
            </Box>
            <Box>
              <Label htmlFor="workerSid">Worker SID</Label>
              <Input id="workerSid" value={workerSid} onChange={e => setWorkerSid(e.target.value)} />
            </Box>
            <Box>
              <Label htmlFor="identity">Identity (client:agent:42)</Label>
              <Input id="identity" value={identity} onChange={e => setIdentity(e.target.value)} />
            </Box>
            <Button variant="primary" type="submit">Login</Button>
          </Stack>
        </Box>
      </Card>
    </Box>
  );
}
