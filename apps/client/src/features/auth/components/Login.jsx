// contact-center/client/src/components/Login.jsx
import { useState } from 'react';
import Api from '../../index.js';

import { Box } from '@twilio-paste/core/box';
import { Heading } from '@twilio-paste/core/heading';
import { Input } from '@twilio-paste/core/input';
import { Label } from '@twilio-paste/core/label';
import { Button } from '@twilio-paste/core/button';
import { Stack } from '@twilio-paste/core/stack';
import { Card } from '@twilio-paste/core/card';
import { Callout, CalloutHeading, CalloutText } from '@twilio-paste/core/callout';
import { FormControl } from '@twilio-paste/core/form';
import { HelpText } from '@twilio-paste/core/help-text';
import { Spinner } from '@twilio-paste/core/spinner';
export default function Login({ onReady }) {
  const [agentId, setAgentId] = useState('');
  const [workerSid, setWorkerSid] = useState('');
  const [identity, setIdentity] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const errors = {};
    if (!agentId) errors.agentId = 'Agent ID is required';
    if (!workerSid) errors.workerSid = 'Worker SID is required';
    if (!identity) errors.identity = 'Identity is required';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const data = await Api.login(agentId, workerSid, identity);
      onReady({ agent: data.agent });
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
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
            <FormControl>
              <Label htmlFor="agentId">Agent ID</Label>
              <Input
                id="agentId"
                value={agentId}
                onChange={e => {
                  setAgentId(e.target.value);
                  if (fieldErrors.agentId)
                    setFieldErrors(prev => ({ ...prev, agentId: undefined }));
                }}
                required
                autoFocus
                hasError={Boolean(fieldErrors.agentId)}
              />
              {fieldErrors.agentId ? (
                <HelpText variant="error">{fieldErrors.agentId}</HelpText>
              ) : null}
            </FormControl>
            <FormControl>
              <Label htmlFor="workerSid">Worker SID</Label>
              <Input
                id="workerSid"
                value={workerSid}
                onChange={e => {
                  setWorkerSid(e.target.value);
                  if (fieldErrors.workerSid)
                    setFieldErrors(prev => ({ ...prev, workerSid: undefined }));
                }}
                required
                hasError={Boolean(fieldErrors.workerSid)}
              />
              {fieldErrors.workerSid ? (
                <HelpText variant="error">{fieldErrors.workerSid}</HelpText>
              ) : null}
            </FormControl>
            <FormControl>
              <Label htmlFor="identity">Identity (client:agent:42)</Label>
              <Input
                id="identity"
                value={identity}
                onChange={e => {
                  setIdentity(e.target.value);
                  if (fieldErrors.identity)
                    setFieldErrors(prev => ({ ...prev, identity: undefined }));
                }}
                required
                hasError={Boolean(fieldErrors.identity)}
              />
              {fieldErrors.identity ? (
                <HelpText variant="error">{fieldErrors.identity}</HelpText>
              ) : null}
            </FormControl>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Spinner decorative={false} title="Loading" size="sizeIcon20" />
                  {' '}
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </Stack>
        </Box>
      </Card>
    </Box>
  );
}
