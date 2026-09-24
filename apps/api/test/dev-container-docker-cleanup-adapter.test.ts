import assert from 'node:assert/strict';
import test from 'node:test';

import { DEV_CONTAINER_OWNERSHIP_LABEL } from '../src/services/dev-container-up-adapter.js';
import {
  DevContainerDockerCleanupAdapterError,
  buildFindDevContainerByOwnershipCommand,
  buildInspectOwnedDevContainerCommand,
  buildRemoveOwnedDevContainerCommand,
  buildStopOwnedDevContainerCommand,
  parseOwnedDevContainerInspectOutput,
  parseOwnedDevContainerLookupOutput,
} from '../src/services/dev-container-docker-cleanup-adapter.js';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const CONTAINER_ID = 'a'.repeat(64);
const OTHER_CONTAINER_ID = 'b'.repeat(64);

test('lookup Docker usa somente label opaco de ownership e IDs completos', () => {
  assert.deepEqual(buildFindDevContainerByOwnershipCommand(TOKEN), {
    program: 'docker',
    args: [
      'container',
      'ls',
      '--all',
      '--quiet',
      '--no-trunc',
      '--filter',
      'label=' + DEV_CONTAINER_OWNERSHIP_LABEL + '=' + TOKEN,
    ],
  });
});

test('lookup aceita ausência ou um container e falha fechado quando ownership é ambíguo', () => {
  assert.deepEqual(parseOwnedDevContainerLookupOutput('\n'), {
    state: 'absent',
  });
  assert.deepEqual(parseOwnedDevContainerLookupOutput(CONTAINER_ID + '\n'), {
    state: 'present',
    containerId: CONTAINER_ID,
  });

  assert.throws(
    () =>
      parseOwnedDevContainerLookupOutput(
        CONTAINER_ID + '\n' + OTHER_CONTAINER_ID + '\n',
      ),
    (error: unknown) =>
      error instanceof DevContainerDockerCleanupAdapterError &&
      error.code === 'DEV_CONTAINER_DOCKER_OWNERSHIP_AMBIGUOUS',
  );
});

test('inspect exige containerId e label de ownership exatos', () => {
  const command = buildInspectOwnedDevContainerCommand(CONTAINER_ID);
  assert.equal(command.program, 'docker');
  assert.deepEqual(command.args.slice(0, 4), [
    'inspect',
    '--type',
    'container',
    '--format',
  ]);
  assert.match(command.args[4] ?? '', /devdashboard\.environment/);
  assert.equal(command.args[5], CONTAINER_ID);

  const result = parseOwnedDevContainerInspectOutput(
    CONTAINER_ID + '|' + TOKEN + '|true\n',
    CONTAINER_ID,
    TOKEN,
  );

  assert.deepEqual(result, {
    containerId: CONTAINER_ID,
    running: true,
  });
});

test('inspect rejeita container diferente ou label divergente', () => {
  assert.throws(
    () =>
      parseOwnedDevContainerInspectOutput(
        OTHER_CONTAINER_ID + '|' + TOKEN + '|false\n',
        CONTAINER_ID,
        TOKEN,
      ),
    (error: unknown) =>
      error instanceof DevContainerDockerCleanupAdapterError &&
      error.code === 'DEV_CONTAINER_DOCKER_OWNERSHIP_MISMATCH',
  );

  assert.throws(
    () =>
      parseOwnedDevContainerInspectOutput(
        CONTAINER_ID +
          '|22222222-2222-4222-8222-222222222222|false\n',
        CONTAINER_ID,
        TOKEN,
      ),
    (error: unknown) =>
      error instanceof DevContainerDockerCleanupAdapterError &&
      error.code === 'DEV_CONTAINER_DOCKER_OWNERSHIP_MISMATCH',
  );
});

test('stop e remove são scoped ao containerId e nunca removem volumes/forçam cleanup', () => {
  const stop = buildStopOwnedDevContainerCommand(CONTAINER_ID);
  const remove = buildRemoveOwnedDevContainerCommand(CONTAINER_ID);

  assert.deepEqual(stop, {
    program: 'docker',
    args: ['container', 'stop', CONTAINER_ID],
  });
  assert.deepEqual(remove, {
    program: 'docker',
    args: ['container', 'rm', CONTAINER_ID],
  });

  const allArgs = [...stop.args, ...remove.args];
  assert.equal(allArgs.includes('--volumes'), false);
  assert.equal(allArgs.includes('-v'), false);
  assert.equal(allArgs.includes('--force'), false);
  assert.equal(allArgs.includes('-f'), false);
});

test('adapter rejeita token/containerId fora do contrato e output inválido', () => {
  assert.throws(
    () => buildFindDevContainerByOwnershipCommand('../token'),
    (error: unknown) =>
      error instanceof DevContainerDockerCleanupAdapterError &&
      error.code === 'DEV_CONTAINER_DOCKER_INPUT_INVALID',
  );
  assert.throws(
    () => buildStopOwnedDevContainerCommand('../container'),
    (error: unknown) =>
      error instanceof DevContainerDockerCleanupAdapterError &&
      error.code === 'DEV_CONTAINER_DOCKER_INPUT_INVALID',
  );
  assert.throws(
    () => parseOwnedDevContainerLookupOutput('../container\n'),
    (error: unknown) =>
      error instanceof DevContainerDockerCleanupAdapterError &&
      error.code === 'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
  );
});
