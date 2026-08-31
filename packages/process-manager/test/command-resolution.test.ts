import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { resolveServerCommand } from '../src/command-resolution.js';

async function makeProject(
  t: test.TestContext,
  scripts: Record<string, string>,
): Promise<Project> {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-command-resolution-'),
  );
  t.after(() => rm(projectPath, { recursive: true, force: true }));
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts }),
  );
  return {
    id: 'fixture-project',
    name: 'Fixture',
    path: projectPath,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: [],
  };
}

test('resolve api:start quando o projeto usa script de servidor com namespace', async (t) => {
  const project = await makeProject(t, {
    'api:start': 'node apps/api/server.js',
  });

  const command = await resolveServerCommand(project, '127.0.0.1', 4310);

  assert.equal(command.command, 'npm');
  assert.deepEqual(command.args, ['run', 'api:start']);
  assert.equal(command.env.PORT, '4310');
  assert.equal(command.env.HOST, '127.0.0.1');
});

test('mantém dev como prioridade sobre scripts namespaced', async (t) => {
  const project = await makeProject(t, {
    dev: 'node dev.js',
    'api:start': 'node api.js',
  });

  const command = await resolveServerCommand(project, '127.0.0.1', 4311);

  assert.deepEqual(command.args, ['run', 'dev']);
});
