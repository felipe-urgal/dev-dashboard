import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isStoredProcess } from '../src/index.js';

const validProcess = {
  id: 'project:server',
  projectId: 'project',
  kind: 'server',
  status: 'running',
  pid: 1234,
  port: 3000,
  command: 'npm',
  args: ['run', 'dev'],
  cwd: '/tmp/project',
  logPath: '/tmp/project.log',
  startedAt: new Date().toISOString(),
};

test('accepts a valid stored process', () => {
  assert.equal(isStoredProcess(validProcess), true);
});

test('rejects invalid status, pid, port and timestamps', () => {
  assert.equal(
    isStoredProcess({ ...validProcess, status: 'unknown' }),
    false,
  );
  assert.equal(
    isStoredProcess({ ...validProcess, pid: -10 }),
    false,
  );
  assert.equal(
    isStoredProcess({ ...validProcess, port: 80 }),
    false,
  );
  assert.equal(
    isStoredProcess({ ...validProcess, startedAt: 'yesterday' }),
    false,
  );
});

test('requires a non-empty composeServiceName for the compose-build kind', () => {
  const composeBuildProcess = {
    ...validProcess,
    id: 'project:compose-build:web',
    kind: 'compose-build',
    composeServiceName: 'web',
  };

  assert.equal(isStoredProcess(composeBuildProcess), true);
  assert.equal(
    isStoredProcess({ ...composeBuildProcess, composeServiceName: undefined }),
    false,
  );
  assert.equal(
    isStoredProcess({ ...composeBuildProcess, composeServiceName: '' }),
    false,
  );
  assert.equal(
    isStoredProcess({ ...composeBuildProcess, composeServiceName: 42 }),
    false,
  );
});
