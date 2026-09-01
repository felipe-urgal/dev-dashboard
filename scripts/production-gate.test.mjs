import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../.dev-dashboard/production.json', import.meta.url), 'utf8'),
);
const gatePath = new URL('./production-gate.mjs', import.meta.url).pathname;

test('self-production permanece desabilitada até existir helper externo', () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.production.enabled, false);
  assert.equal(manifest.production.strategy, 'disabled');
  assert.equal(manifest.production.provider, 'none');
  assert.deepEqual(manifest.production.blockedBy, [
    'external-helper-not-implemented',
    'self-restart-handoff-not-implemented',
    'production-health-not-validated',
    'privilege-model-not-validated',
  ]);
});

test('prod:status é somente leitura e expõe blockers', () => {
  const result = spawnSync(process.execPath, [gatePath, 'status'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Self-production do Dev Dashboard ainda está bloqueada por contrato/);
  assert.match(result.stdout, /external-helper-not-implemented/);
});

test('prod:check falha de propósito enquanto self-update não é seguro', () => {
  const result = spawnSync(process.execPath, [gatePath, 'check'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Self-production do Dev Dashboard não está pronta para habilitação/);
});
