import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PROJECT_RECENT_LIMITS,
  ProjectRecentRepository,
} from '../src/project-recent-repository.js';

test('persiste acessos em arquivo privado e move o projeto repetido para o topo', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'project-recents-'));
  let now = new Date('2026-08-04T20:00:00.000Z');
  const repository = new ProjectRecentRepository(directory, () => now);

  await repository.record('project-a', 'workspace-a');
  now = new Date('2026-08-04T20:01:00.000Z');
  await repository.record('project-b', 'workspace-a');
  now = new Date('2026-08-04T20:02:00.000Z');
  await repository.record('project-a', 'workspace-a');

  assert.deepEqual(repository.list().map((entry) => entry.projectId), [
    'project-a',
    'project-b',
  ]);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);
  assert.deepEqual(
    new ProjectRecentRepository(directory).list(),
    repository.list(),
  );
});

test('separa workspaces e aplica os limites fechados', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'project-recents-'));
  let tick = 0;
  const repository = new ProjectRecentRepository(directory, () =>
    new Date(Date.UTC(2026, 7, 4, 20, 0, tick++)),
  );

  for (let index = 0; index < PROJECT_RECENT_LIMITS.perWorkspace + 3; index += 1) {
    await repository.record(`project-a-${index}`, 'workspace-a');
  }
  await repository.record('project-b', 'workspace-b');

  assert.equal(
    repository.list().filter((entry) => entry.workspaceId === 'workspace-a').length,
    PROJECT_RECENT_LIMITS.perWorkspace,
  );
  assert.equal(repository.find('project-b')?.workspaceId, 'workspace-b');
  assert.equal(repository.find('project-a-0'), null);
});

test('arquivo inválido degrada para lista vazia', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'project-recents-'));
  await writeFile(path.join(directory, 'project-recents.json'), '{ inválido', 'utf8');

  const repository = new ProjectRecentRepository(directory);
  assert.deepEqual(repository.list(), []);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'project-recents.json'), 'utf8') || 'null'), null);
});
