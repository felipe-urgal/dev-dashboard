import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDevContainerShellCommand,
  isValidDevContainerRuntimeId,
} from '../src/services/dev-container-exec-adapter.js';

test('constrói shell Dev Container por containerId backend-owned', () => {
  const runtimeId = 'a'.repeat(64);

  assert.equal(isValidDevContainerRuntimeId(runtimeId), true);
  assert.deepEqual(buildDevContainerShellCommand(runtimeId), {
    file: 'devcontainer',
    args: ['exec', '--container-id', runtimeId, '/bin/sh'],
  });
});

test('rejeita runtimeId que não é containerId estruturado', () => {
  assert.equal(isValidDevContainerRuntimeId('../container'), false);
  assert.throws(
    () => buildDevContainerShellCommand('../container'),
    /runtimeId inválido/u,
  );
});
