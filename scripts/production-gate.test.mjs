import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { runProductionGate } from './production-gate.mjs';

const manifest = JSON.parse(
  await readFile(
    new URL('../.dev-dashboard/production.json', import.meta.url),
    'utf8',
  ),
);

function capture() {
  let content = '';
  return {
    stream: {
      write(value) {
        content += String(value);
      },
    },
    read() {
      return content;
    },
  };
}

function readyAgent() {
  return {
    status: 0,
    stdout: JSON.stringify({
      status: 'ready',
      instanceId: '22222222-2222-4222-8222-222222222222',
      actions: ['ping', 'inspect', 'claim', 'recover'],
    }),
    stderr: '',
  };
}

test('self-production usa contrato fechado e habilitado', () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.production.enabled, true);
  assert.equal(manifest.production.strategy, 'self-update');
  assert.equal(manifest.production.provider, 'none');
  assert.equal(manifest.production.reasonCode, undefined);
  assert.equal(manifest.production.blockedBy, undefined);
  assert.deepEqual(manifest.production.commands, {
    status: 'prod:status',
    check: 'prod:check',
  });
});

test('prod:status é somente leitura e informa readiness do agent', () => {
  const stdout = capture();
  const stderr = capture();
  const code = runProductionGate(['status'], {
    runner: readyAgent,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(code, 0);
  assert.match(stdout.read(), /self-production.*habilitada/i);
  assert.match(stdout.read(), /agent: pronto/i);
  assert.equal(stderr.read(), '');
});

test('prod:check só libera quando agent comprova claim e inspect', () => {
  const stdout = capture();
  const stderr = capture();
  const code = runProductionGate(['check'], {
    runner: readyAgent,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(code, 0);
  assert.match(stdout.read(), /self-production pronta/i);
  assert.equal(stderr.read(), '');
});

test('prod:check falha fechado para agent indisponível ou incompleto', () => {
  const unavailableError = capture();
  assert.equal(
    runProductionGate(['check'], {
      runner: () => ({ status: 1, stdout: '', stderr: 'offline' }),
      stdout: capture().stream,
      stderr: unavailableError.stream,
    }),
    1,
  );
  assert.match(unavailableError.read(), /agent local não está pronto/i);

  const incompleteError = capture();
  assert.equal(
    runProductionGate(['check'], {
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          status: 'ready',
          instanceId: 'agent',
          actions: ['ping', 'claim'],
        }),
        stderr: '',
      }),
      stdout: capture().stream,
      stderr: incompleteError.stream,
    }),
    1,
  );
  assert.match(incompleteError.read(), /claim \+ inspect/i);
});
