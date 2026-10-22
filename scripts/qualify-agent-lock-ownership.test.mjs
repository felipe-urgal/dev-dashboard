import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const fixture = new URL('./qualify-agent-lock-ownership.mjs', import.meta.url);

test('physical Agent ownership gate requires explicit opt-in', () => {
  const result = spawnSync(process.execPath, [fixture.pathname], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, AGENT_LOCK_QUALIFY: '' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires AGENT_LOCK_QUALIFY=1/);
  assert.equal(result.stdout, '');
});

test('physical Agent ownership gate refuses arbitrary target arguments', () => {
  const result = spawnSync(
    process.execPath,
    [fixture.pathname, '/tmp/production-project'],
    {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, AGENT_LOCK_QUALIFY: '1' },
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No user-provided target paths/);
  assert.equal(result.stdout, '');
});
