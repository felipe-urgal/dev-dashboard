import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(
  new URL('./qualify-runtime-profile-isolation.mjs', import.meta.url),
);

test('physical qualification is opt-in and cannot access Docker by default', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, RUNTIME_ISOLATION_QUALIFY: '0' },
    timeout: 5_000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /RUNTIME_ISOLATION_QUALIFY=1 is required/);
});

test('physical qualification rejects resource arguments before any Docker work', () => {
  const result = spawnSync(process.execPath, [script, '--target=production'], {
    encoding: 'utf8',
    env: { ...process.env, RUNTIME_ISOLATION_QUALIFY: '1' },
    timeout: 5_000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No target\/resource arguments/);
});
