import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProcessManager } from '../src/index.js';

test('passes the selected environment to the managed server process', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-runtime-env-'),
  );
  const projectPath = path.join(root, 'project');
  const stateDirectory = path.join(root, 'state');
  const markerPath = path.join(projectPath, 'runtime-env.txt');

  await mkdir(projectPath, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify({
        name: 'runtime-env-fixture',
        scripts: { dev: 'node --env-file-if-exists=.env server.js' },
      }),
    ),
    writeFile(
      path.join(projectPath, '.env'),
      'RUNTIME_ENV_MARKER=project-default\nPORT=9999\n',
    ),
    writeFile(
      path.join(projectPath, 'server.js'),
      [
        "const fs = require('node:fs');",
        "const http = require('node:http');",
        "fs.writeFileSync('runtime-env.txt', process.env.RUNTIME_ENV_MARKER || 'missing');",
        "http.createServer((_request, response) => response.end('ok')).listen(Number(process.env.PORT), '127.0.0.1');",
        '',
      ].join('\n'),
    ),
  ]);

  const project: Project = {
    id: 'runtime-env-fixture',
    name: 'Runtime env fixture',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };
  const manager = new ProcessManager(stateDirectory);

  context.after(async () => {
    await manager.stopServer(project.id).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });

  await manager.startServer(project, {
    environment: {
      RUNTIME_ENV_MARKER: 'selected-environment',
      PORT: '9998',
    },
  });

  let marker = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      marker = await readFile(markerPath, 'utf8');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  assert.equal(marker, 'selected-environment');

  const running = await manager.getServerProcess(project.id);
  assert.ok(running?.port);
  assert.notEqual(running.port, 9_998);
  assert.notEqual(running.port, 9_999);
});
