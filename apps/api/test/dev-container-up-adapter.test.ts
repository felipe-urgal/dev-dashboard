import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEV_CONTAINER_OWNERSHIP_LABEL,
  DevContainerUpAdapterError,
  buildDevContainerUpCommand,
  parseDevContainerUpOutput,
} from '../src/services/dev-container-up-adapter.js';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const CONTAINER_ID = 'a'.repeat(64);

test('adapter constrói devcontainer up com argv fechado e ownership backend-owned', () => {
  const command = buildDevContainerUpCommand({
    workspaceFolder: '/workspace/project',
    configSource: '.devcontainer/devcontainer.json',
    ownershipToken: TOKEN,
  });

  assert.deepEqual(command, {
    program: 'devcontainer',
    args: [
      'up',
      '--workspace-folder',
      '/workspace/project',
      '--config',
      '/workspace/project/.devcontainer/devcontainer.json',
      '--id-label',
      DEV_CONTAINER_OWNERSHIP_LABEL + '=' + TOKEN,
      '--skip-post-create',
      '--no-lockfile',
      '--log-format',
      'json',
    ],
  });
  assert.equal(command.args.includes('--remove-existing-container'), false);
  assert.equal(command.args.includes('--mount'), false);
  assert.equal(command.args.includes('--remote-env'), false);
});

test('adapter rejeita workspace relativo e token fora do contrato', () => {
  assert.throws(
    () =>
      buildDevContainerUpCommand({
        workspaceFolder: 'workspace/project',
        configSource: '.devcontainer.json',
        ownershipToken: TOKEN,
      }),
    (error: unknown) =>
      error instanceof DevContainerUpAdapterError &&
      error.code === 'DEV_CONTAINER_UP_INPUT_INVALID',
  );

  assert.throws(
    () =>
      buildDevContainerUpCommand({
        workspaceFolder: '/workspace/project',
        configSource: '.devcontainer.json',
        ownershipToken: 'token-controlado',
      }),
    (error: unknown) =>
      error instanceof DevContainerUpAdapterError &&
      error.code === 'DEV_CONTAINER_UP_INPUT_INVALID',
  );
});

test('parser encontra envelope success após logs JSON e descarta campos extras', () => {
  const output = [
    JSON.stringify({
      type: 'start',
      text: 'Run: docker build --secret TOKEN=nao-pode-sair',
    }),
    JSON.stringify({
      outcome: 'success',
      containerId: CONTAINER_ID,
      remoteUser: 'node',
      remoteWorkspaceFolder: '/workspaces/project',
      internalSecret: 'nao-pode-sair',
      configuration: {
        remoteEnv: { TOKEN: 'nao-pode-sair' },
      },
    }),
    '',
  ].join('\n');

  const result = parseDevContainerUpOutput(output);

  assert.deepEqual(result, {
    outcome: 'success',
    containerId: CONTAINER_ID,
    remoteUser: 'node',
    remoteWorkspaceFolder: '/workspaces/project',
  });
  assert.equal(JSON.stringify(result).includes('nao-pode-sair'), false);
});

test('parser preserva somente containerId e didStopContainer do envelope de erro', () => {
  const result = parseDevContainerUpOutput(
    JSON.stringify({
      outcome: 'error',
      containerId: CONTAINER_ID,
      didStopContainer: false,
      message: 'erro com secret',
      description: 'detalhe interno',
    }),
  );

  assert.deepEqual(result, {
    outcome: 'error',
    containerId: CONTAINER_ID,
    didStopContainer: false,
  });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('parser preserva composeProjectName bounded para detectar mudança de configuração', () => {
  const result = parseDevContainerUpOutput(
    JSON.stringify({
      outcome: 'success',
      containerId: CONTAINER_ID,
      composeProjectName: 'workspace_devcontainer',
      remoteUser: 'vscode',
      remoteWorkspaceFolder: '/workspace',
    }),
  );

  assert.equal(result.outcome, 'success');
  assert.equal(result.composeProjectName, 'workspace_devcontainer');
});

test('parser falha fechado sem envelope ou com containerId inválido', () => {
  assert.throws(
    () =>
      parseDevContainerUpOutput(
        JSON.stringify({ type: 'stop', text: 'sem envelope' }),
      ),
    (error: unknown) =>
      error instanceof DevContainerUpAdapterError &&
      error.code === 'DEV_CONTAINER_UP_OUTPUT_INVALID',
  );

  assert.throws(
    () =>
      parseDevContainerUpOutput(
        JSON.stringify({
          outcome: 'success',
          containerId: '../container',
        }),
      ),
    (error: unknown) =>
      error instanceof DevContainerUpAdapterError &&
      error.code === 'DEV_CONTAINER_UP_OUTPUT_INVALID',
  );
});

test('parser ignora logs antigos quando a saída excede o limite de análise', () => {
  const oversizedLogs = 'x'.repeat(256 * 1024 + 1);
  const result = parseDevContainerUpOutput(
    oversizedLogs +
      '\n' +
      JSON.stringify({
        outcome: 'success',
        containerId: CONTAINER_ID,
      }),
  );

  assert.deepEqual(result, {
    outcome: 'success',
    containerId: CONTAINER_ID,
  });
});
