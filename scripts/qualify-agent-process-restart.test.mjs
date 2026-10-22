import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = new URL('./qualify-agent-process-restart.mjs', import.meta.url);

test('physical Agent restart requires explicit opt-in', () => {
  const result = spawnSync(process.execPath, [script.pathname], {
    env: { ...process.env, AGENT_RESTART_QUALIFY: '' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires AGENT_RESTART_QUALIFY=1/);
  assert.equal(result.stdout, '');
});

test('physical Agent restart refuses caller-owned targets and paths', () => {
  const result = spawnSync(
    process.execPath,
    [script.pathname, '/tmp/user-project'],
    {
      env: { ...process.env, AGENT_RESTART_QUALIFY: '1' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No non-disposable target arguments/);
  assert.equal(result.stdout, '');
});

test('physical Agent restart worker requires an eligible disposable root', () => {
  const result = spawnSync(process.execPath, [script.pathname, '--verify'], {
    env: {
      ...process.env,
      AGENT_RESTART_QUALIFY: '1',
      AGENT_RESTART_FIXTURE: '/tmp/not-a-qualification-root',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Restart qualification worker failed/);
  assert.equal(result.stdout, '');
});
