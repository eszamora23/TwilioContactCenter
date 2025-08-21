import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { signAgentToken, requireAuth } from 'shared/auth';
import { serverEnv as env } from 'shared/env';

function createRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('accepts tokens signed with HS256', () => {
  const token = signAgentToken('user', 'WS123', 'alice');
  const req = { headers: { cookie: `${env.accessTokenName}=${token}` } };
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, undefined);
});

test('rejects tokens signed with non-HS256 algorithms', () => {
  const token = jwt.sign({ sub: 'user' }, env.jwtSecret, { algorithm: 'HS512' });
  const req = { headers: { cookie: `${env.accessTokenName}=${token}` } };
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'invalid token' });
});
