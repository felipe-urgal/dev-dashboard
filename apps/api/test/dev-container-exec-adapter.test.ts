import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDevContainerShellCommand,
  buildDevContainerTestCommand,
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

test('constrói execução de testes no workspace sem aceitar path remoto do browser', () => {
  const runtimeId = 'b'.repeat(64);
  assert.deepEqual(
    buildDevContainerTestCommand({
      runtimeId,
      workspaceFolder: '/workspace/app',
      command: '/workspace/app/bin/rspec',
      args: ['spec'],
      remoteEnvironment: {
        RAILS_ENV: 'test',
        RACK_ENV: 'test',
      },
    }),
    {
      file: 'devcontainer',
      args: [
        'exec',
        '--container-id',
        runtimeId,
        '--workspace-folder',
        '/workspace/app',
        '--remote-env',
        'RAILS_ENV=test',
        '--remote-env',
        'RACK_ENV=test',
        './bin/rspec',
        'spec',
      ],
    },
  );
});

test('rejeita comando absoluto fora do workspace', () => {
  assert.throws(
    () =>
      buildDevContainerTestCommand({
        runtimeId: 'c'.repeat(64),
        workspaceFolder: '/workspace/app',
        command: '/tmp/runner',
        args: [],
      }),
    /fora do workspace/u,
  );
});
