import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RetentionSettingsRepository } from '../src/retention-settings-repository.js';

test('usa padrões seguros quando o arquivo não existe ou está inválido', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'retention-settings-'));
  await writeFile(path.join(directory, 'retention.json'), '{}');
  assert.deepEqual(
    new RetentionSettingsRepository(directory).snapshot().values,
    { retentionDays: 7, scriptHistoryLimit: 200, testHistoryLimit: 50 },
  );
});

test('persiste atomicamente valores válidos em arquivo privado', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'retention-settings-'));
  const repository = new RetentionSettingsRepository(directory);
  const values = {
    retentionDays: 30,
    scriptHistoryLimit: 300,
    testHistoryLimit: 100,
  };
  const result = await repository.update(values);
  assert.equal(result.appliesAfterRestart, true);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, 'retention.json'), 'utf8')),
    { version: 1, ...values },
  );
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal(
    (await stat(path.join(directory, 'retention.json'))).mode & 0o777,
    0o600,
  );
});

test('recusa valores fora dos limites também no repositório', async () => {
  const repository = new RetentionSettingsRepository(
    await mkdtemp(path.join(tmpdir(), 'retention-settings-')),
  );
  await assert.rejects(
    repository.update({
      retentionDays: 0,
      scriptHistoryLimit: 200,
      testHistoryLimit: 50,
    }),
    /fora dos limites/,
  );
});
