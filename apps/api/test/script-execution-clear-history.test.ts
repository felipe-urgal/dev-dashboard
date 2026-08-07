import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ScriptDetectionService } from '../src/services/script-detection-service.js';
import {
  ScriptExecutionError,
  ScriptExecutionService,
} from '../src/services/script-execution-service.js';

async function fixture(script: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-clear-scripts-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: script } }),
  );
  await writeFile(path.join(root, 'package-lock.json'), '{}');
  const project = {
    id: 'projeto-clear-history',
    workspaceId: 'workspace-1',
    name: 'Projeto',
    path: root,
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: ['scripts'],
  } as Project;
  const service = new ScriptExecutionService(
    new ScriptDetectionService(),
    root,
  );
  return { root, project, service };
}

async function waitForTerminal(
  service: ScriptExecutionService,
  projectId: string,
  executionId: string,
) {
  let execution = await service.get(projectId, executionId);
  for (let attempt = 0; attempt < 80 && execution.status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    execution = await service.get(projectId, executionId);
  }
  return execution;
}

test('limpa execuções finalizadas e seus registros persistidos', async (t) => {
  const { root, project, service } = await fixture(
    'node -e "console.log(123)"',
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });

  const started = await service.start(project, 'package-script:test');
  const finished = await waitForTerminal(service, project.id, started.id);
  assert.equal(finished.status, 'succeeded');
  assert.equal((await service.history(project.id)).total, 1);

  assert.equal(await service.clearHistory(project.id), 1);
  assert.equal((await service.history(project.id)).total, 0);
  assert.equal(await service.latest(project.id), null);
  await assert.rejects(
    () => service.get(project.id, started.id),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_EXECUTION_NOT_FOUND',
  );
});

test('mantém uma execução em andamento ao limpar o histórico', async (t) => {
  const { root, project, service } = await fixture(
    'node -e "setTimeout(() => {}, 1000)"',
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });

  const started = await service.start(project, 'package-script:test');
  assert.equal((await service.get(project.id, started.id)).status, 'running');

  assert.equal(await service.clearHistory(project.id), 0);
  assert.equal((await service.history(project.id)).total, 1);
  assert.equal((await service.get(project.id, started.id)).status, 'running');

  await service.cancel(project.id, started.id);
});
