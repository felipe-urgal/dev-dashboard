import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ACTIVITY_EVENT_LIMITS,
  ActivityEventRepository,
  ActivityEventRepositoryError,
} from '../src/activity-event-repository.js';

test('persiste apenas metadata bounded e sanitizada em arquivo privado', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'activity-events-'));
  const repository = new ActivityEventRepository(
    directory,
    () => new Date('2026-09-19T10:00:00.000Z'),
  );

  const event = await repository.append({
    projectId: 'project-a',
    environmentInstanceId: 'environment-a',
    domain: 'test',
    type: 'suite.completed',
    status: 'succeeded',
    summary: '  Testes\nconcluídos\u0007 com sucesso  ',
    resourceRef: { kind: 'test-execution', id: 'execution-a' },
    jobId: 'job-a',
  });

  assert.equal(event.summary, 'Testes concluídos com sucesso');
  assert.equal(repository.list()[0]?.id, event.id);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);

  const stored = JSON.parse(await readFile(repository.filePath, 'utf8'));
  assert.equal(stored.version, 1);
  assert.deepEqual(Object.keys(stored.events[0]).sort(), [
    'domain',
    'environmentInstanceId',
    'id',
    'jobId',
    'occurredAt',
    'projectId',
    'resourceRef',
    'status',
    'summary',
    'type',
  ]);
});

test('filtra por projeto, ambiente e domínio sem criar nova engine de jobs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'activity-events-'));
  const repository = new ActivityEventRepository(directory);

  await repository.append({
    projectId: 'project-a',
    environmentInstanceId: 'environment-a',
    domain: 'git',
    type: 'sync.completed',
    summary: 'Git sincronizado',
  });
  await repository.append({
    projectId: 'project-a',
    environmentInstanceId: 'environment-b',
    domain: 'test',
    type: 'suite.completed',
    summary: 'Testes concluídos',
  });

  assert.equal(
    repository.list({ projectId: 'project-a', domain: 'git' }).length,
    1,
  );
  assert.equal(
    repository.list({ environmentInstanceId: 'environment-b' })[0]?.domain,
    'test',
  );
});

test('aplica retenção por tempo e quantidade', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'activity-events-'));
  let tick = 0;
  const now = new Date('2026-09-19T10:00:00.000Z');
  const repository = new ActivityEventRepository(directory, () => now);

  await repository.append({
    projectId: 'project-a',
    domain: 'git',
    type: 'old',
    summary: 'Evento antigo',
    occurredAt: '2026-08-01T10:00:00.000Z',
  });

  for (let index = 0; index < ACTIVITY_EVENT_LIMITS.perProject + 2; index += 1) {
    tick += 1;
    await repository.append({
      projectId: 'project-a',
      domain: 'test',
      type: 'suite.completed',
      summary: `Execução ${index}`,
      occurredAt: new Date(now.getTime() - tick * 1000).toISOString(),
    });
  }

  assert.equal(repository.list({ projectId: 'project-a', limit: 500 }).length, ACTIVITY_EVENT_LIMITS.perProject);
  assert.equal(
    repository.list({ projectId: 'project-a', limit: 500 }).some((event) => event.type === 'old'),
    false,
  );
});

test('rejeita shape inválido e degrada arquivo ilegível para vazio', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'activity-events-'));
  const repository = new ActivityEventRepository(directory);

  await assert.rejects(
    repository.append({
      projectId: 'project-a',
      domain: 'git',
      type: '',
      summary: 'Inválido',
    }),
    (error) =>
      error instanceof ActivityEventRepositoryError &&
      error.code === 'ACTIVITY_EVENT_INVALID',
  );

  await writeFile(
    path.join(directory, 'activity-events.json'),
    '{ inválido',
    'utf8',
  );
  assert.deepEqual(new ActivityEventRepository(directory).list(), []);
});
