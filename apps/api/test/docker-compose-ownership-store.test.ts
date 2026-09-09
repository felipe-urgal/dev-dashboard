import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DockerComposeOwnershipStore } from '../src/services/docker-compose-ownership-store.js';

const NOW = new Date('2026-09-09T18:30:00.000Z');

function project(projectPath: string): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };
}

async function fixture(context: TestContext) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-compose-ownership-'),
  );
  context.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    statePath: path.join(root, 'state', 'compose-ownership.json'),
    project: project(path.join(root, 'project')),
  };
}

test('persiste ownership e permite reabrir o estado após restart da API', async (context) => {
  const setup = await fixture(context);
  const first = new DockerComposeOwnershipStore(setup.statePath, {
    now: () => NOW,
  });

  const claimed = await first.claim(setup.project, 'workspace-project');
  assert.equal(claimed.startedAt, NOW.toISOString());
  assert.equal(await first.owns(setup.project, 'workspace-project'), true);

  const reopened = new DockerComposeOwnershipStore(setup.statePath);
  assert.equal(await reopened.owns(setup.project, 'workspace-project'), true);
  assert.equal((await reopened.get(setup.project))?.startedAt, NOW.toISOString());
});

test('não transfere ownership quando o mesmo projectId aponta para outro path', async (context) => {
  const setup = await fixture(context);
  const store = new DockerComposeOwnershipStore(setup.statePath, {
    now: () => NOW,
  });
  await store.claim(setup.project, 'workspace-project');

  const movedProject = project(path.join(setup.root, 'outro-project'));
  assert.equal(await store.get(movedProject), undefined);
  assert.equal(await store.owns(movedProject, 'workspace-project'), false);
  assert.equal(await store.release(movedProject), false);
});

test('estado corrompido falha fechado e não concede ownership implícito', async (context) => {
  const setup = await fixture(context);
  await mkdir(path.dirname(setup.statePath), { recursive: true });
  await writeFile(setup.statePath, '{not-json');

  const store = new DockerComposeOwnershipStore(setup.statePath);
  assert.equal(await store.get(setup.project), undefined);
  assert.equal(await store.owns(setup.project, 'workspace-project'), false);
});

test('release persiste a remoção do ownership', async (context) => {
  const setup = await fixture(context);
  const store = new DockerComposeOwnershipStore(setup.statePath, {
    now: () => NOW,
  });
  await store.claim(setup.project, 'workspace-project');

  assert.equal(await store.release(setup.project), true);

  const reopened = new DockerComposeOwnershipStore(setup.statePath);
  assert.equal(await reopened.get(setup.project), undefined);
});
