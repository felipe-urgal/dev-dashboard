import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { NODE_SERVER_SCRIPT_CANDIDATES } from '@dev-dashboard/contracts';

import { detectProject } from '../src/index.js';

test('detecta capability server para api:start', async (t) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-capability-'),
  );
  t.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'loto-lab-like',
      scripts: {
        'api:start': 'node dist/src/cli/apiStart.js',
      },
    }),
  );

  const project = await detectProject(projectPath);

  assert.ok(project);
  assert.equal(project.type, 'node');
  assert.ok(project.capabilities.includes('server'));
});

test('catálogo compartilhado preserva scripts namespaced reconhecidos', () => {
  assert.ok(NODE_SERVER_SCRIPT_CANDIDATES.includes('api:start'));
  assert.ok(NODE_SERVER_SCRIPT_CANDIDATES.includes('server:start'));
  assert.ok(NODE_SERVER_SCRIPT_CANDIDATES.includes('web:dev'));
});
