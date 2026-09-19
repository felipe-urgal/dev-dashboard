import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TASK_CONTEXT_LIMITS,
  TaskContextRepository,
  TaskContextRepositoryError,
} from '../src/task-context-repository.js';

test('persiste somente bindings estáveis do Task Context em arquivo privado', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-contexts-'));
  const repository = new TaskContextRepository(
    directory,
    () => new Date('2026-09-19T10:00:00.000Z'),
  );

  const context = await repository.create({
    projectId: 'project-a',
    branch: 'feature/task-context',
    environmentInstanceId: 'environment-a',
    worktreeId: 'worktree-a',
    issue: { repository: 'felipe-urgal/dev-dashboard', number: 599 },
    pullRequest: { repository: 'felipe-urgal/dev-dashboard', number: 800 },
  });

  assert.equal(repository.find(context.id)?.issue?.number, 599);
  assert.equal(
    repository.findByEnvironment('project-a', 'environment-a')?.id,
    context.id,
  );
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);

  const stored = JSON.parse(await readFile(repository.filePath, 'utf8'));
  assert.equal(stored.version, 1);
  assert.deepEqual(Object.keys(stored.contexts[0].issue).sort(), [
    'number',
    'repository',
  ]);
  assert.deepEqual(
    new TaskContextRepository(directory).find(context.id),
    repository.find(context.id),
  );
});

test('permite atualizar e remover associações sem trocar contexto implicitamente', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-contexts-'));
  let now = new Date('2026-09-19T10:00:00.000Z');
  const repository = new TaskContextRepository(directory, () => now);
  const context = await repository.create({
    projectId: 'project-a',
    branch: 'feature/a',
    environmentInstanceId: 'environment-a',
  });

  now = new Date('2026-09-19T10:01:00.000Z');
  const updated = await repository.update(context.id, {
    branch: 'feature/b',
    issue: { repository: 'felipe-urgal/dev-dashboard', number: 599 },
    environmentInstanceId: null,
  });

  assert.equal(updated.branch, 'feature/b');
  assert.equal(updated.environmentInstanceId, undefined);
  assert.equal(updated.issue?.number, 599);
  assert.equal(updated.createdAt, context.createdAt);
  assert.notEqual(updated.updatedAt, context.updatedAt);

  await repository.remove(context.id);
  assert.equal(repository.find(context.id), null);
});

test('aplica limite por projeto mantendo os contextos mais recentes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-contexts-'));
  let tick = 0;
  const repository = new TaskContextRepository(
    directory,
    () => new Date(Date.UTC(2026, 8, 19, 10, 0, tick++)),
  );

  for (let index = 0; index < TASK_CONTEXT_LIMITS.perProject + 2; index += 1) {
    await repository.create({
      projectId: 'project-a',
      branch: `feature/${index}`,
    });
  }

  assert.equal(
    repository.list('project-a').length,
    TASK_CONTEXT_LIMITS.perProject,
  );
  assert.equal(
    repository
      .list('project-a')
      .some((context) => context.branch === 'feature/0'),
    false,
  );
});

test('rejeita bindings inválidos e degrada arquivo ilegível para vazio', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-contexts-'));
  const repository = new TaskContextRepository(directory);

  await assert.rejects(
    repository.create({
      projectId: 'project-a',
      branch: 'feature/a',
      issue: { repository: 'felipe-urgal/dev-dashboard', number: 0 },
    }),
    (error) =>
      error instanceof TaskContextRepositoryError &&
      error.code === 'TASK_CONTEXT_INVALID',
  );

  await writeFile(
    path.join(directory, 'task-contexts.json'),
    '{ inválido',
    'utf8',
  );
  assert.deepEqual(new TaskContextRepository(directory).list(), []);
});
