import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';
import { runSelfUpdateHelper } from './self-update-helper.mjs';

const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);

async function createStore(t) {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-self-update-'),
  );
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const store = new SelfUpdateHandoffStore(directory);
  await store.ready();
  return { directory, store };
}

function captureStream() {
  let content = '';
  return {
    stream: {
      write(chunk) {
        content += String(chunk);
        return true;
      },
    },
    read() {
      return content;
    },
  };
}

test('persiste handoff com diretório e arquivo privados', async (t) => {
  const { directory, store } = await createStore(t);
  const handoff = await store.prepare(
    {
      projectId: 'dev-dashboard',
      targetRevision: REVISION,
      planHash: PLAN_HASH,
    },
    Date.parse('2026-09-02T10:30:00.000Z'),
  );

  assert.equal(handoff.status, 'prepared');
  assert.equal(handoff.action, 'self-update');
  assert.equal((await stat(directory)).mode & 0o777, 0o700);

  const files = await readdir(directory);
  assert.deepEqual(files, [`${handoff.id}.json`]);
  assert.equal(
    (await stat(path.join(directory, files[0]))).mode & 0o777,
    0o600,
  );

  const restored = await store.get(handoff.id);
  assert.deepEqual(restored, handoff);
});

test('rejeita estado adulterado em vez de aceitar campos de autoridade', async (t) => {
  const { directory, store } = await createStore(t);
  const handoff = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
  const filePath = path.join(directory, `${handoff.id}.json`);
  const persisted = JSON.parse(await readFile(filePath, 'utf8'));
  persisted.command = 'bash -lc reboot';
  await writeFile(filePath, `${JSON.stringify(persisted)}\n`, 'utf8');
  await chmod(filePath, 0o600);

  await assert.rejects(
    () => store.get(handoff.id),
    /Estado persistido de self-update inválido/,
  );
});

test('rejeita conteúdo cujo id não coincide com o arquivo solicitado', async (t) => {
  const { directory, store } = await createStore(t);
  const first = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
  const second = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: 'c'.repeat(40),
    planHash: 'd'.repeat(64),
  });
  const firstPath = path.join(directory, `${first.id}.json`);
  const secondContent = await readFile(
    path.join(directory, `${second.id}.json`),
    'utf8',
  );
  await writeFile(firstPath, secondContent, 'utf8');
  await chmod(firstPath, 0o600);

  await assert.rejects(
    () => store.get(first.id),
    /Estado persistido de self-update inválido/,
  );
});

test('aplica somente transições fechadas do protocolo', async (t) => {
  const { store } = await createStore(t);
  const handoff = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });

  await assert.rejects(
    () => store.transition(handoff.id, 'restarting'),
    /Transição de self-update inválida: prepared → restarting/,
  );

  const accepted = await store.claim(
    handoff.id,
    Date.parse('2026-09-02T10:31:00.000Z'),
  );
  assert.equal(accepted.status, 'accepted');

  const applying = await store.transition(
    handoff.id,
    'applying',
    undefined,
    Date.parse('2026-09-02T10:32:00.000Z'),
  );
  assert.equal(applying.status, 'applying');

  await assert.rejects(
    () => store.transition(handoff.id, 'succeeded'),
    /Transição de self-update inválida: applying → succeeded/,
  );
});

test('recovery marca somente handoffs aceitos sem resultado terminal', async (t) => {
  const { store } = await createStore(t);
  const pending = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: REVISION,
    planHash: PLAN_HASH,
  });
  const accepted = await store.prepare({
    projectId: 'dev-dashboard',
    targetRevision: 'c'.repeat(40),
    planHash: 'd'.repeat(64),
  });
  await store.claim(accepted.id);

  const recovered = await store.recoverInterrupted(
    Date.parse('2026-09-02T10:35:00.000Z'),
  );

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, accepted.id);
  assert.equal(recovered[0].status, 'recovery_required');
  assert.equal(recovered[0].result.code, 'SELF_UPDATE_HELPER_INTERRUPTED');
  assert.equal((await store.get(pending.id)).status, 'prepared');
});

test('helper expõe apenas comandos estruturados e não aceita opções desconhecidas', async (t) => {
  const { store } = await createStore(t);
  const stdout = captureStream();
  const stderr = captureStream();

  const exitCode = await runSelfUpdateHelper(
    [
      'prepare',
      '--project-id',
      'dev-dashboard',
      '--revision',
      REVISION,
      '--plan-hash',
      PLAN_HASH,
    ],
    { store, stdout: stdout.stream, stderr: stderr.stream },
  );
  assert.equal(exitCode, 0);
  const handoff = JSON.parse(stdout.read());
  assert.equal(handoff.status, 'prepared');
  assert.equal(stderr.read(), '');

  const invalidStdout = captureStream();
  const invalidStderr = captureStream();
  const invalidExitCode = await runSelfUpdateHelper(
    ['prepare', '--command', 'rm -rf /'],
    {
      store,
      stdout: invalidStdout.stream,
      stderr: invalidStderr.stream,
    },
  );
  assert.equal(invalidExitCode, 1);
  assert.equal(invalidStdout.read(), '');
  assert.match(invalidStderr.read(), /Opção desconhecida: --command/);
});
