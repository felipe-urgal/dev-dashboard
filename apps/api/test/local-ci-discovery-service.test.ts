import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  LocalCiDiscoveryService,
  type LocalCiDiscoveryCommandRunner,
} from '../src/services/local-ci-discovery-service.js';

async function withProject(
  workflow: string | null,
  callback: (project: Project) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-local-ci-'));
  try {
    if (workflow !== null) {
      const directory = path.join(root, '.github', 'workflows');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'ci.yml'), workflow, 'utf8');
    }
    await callback({
      id: 'project-1',
      name: 'Projeto',
      path: root,
      type: 'node',
      source: 'workspace',
      enabled: true,
      capabilities: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const availableRunner: LocalCiDiscoveryCommandRunner = async (command) => {
  if (command.program === 'act') return 'act version 0.2.82\n';
  return '27.5.1\n';
};

test('descobre workflow/jobs/eventos via YAML sem editar o arquivo', async () => {
  const workflow = `name: CI\non:\n  push:\n  pull_request:\njobs:\n  build:\n    name: Build and test\n    runs-on: ubuntu-latest\n    steps: []\n`;

  await withProject(workflow, async (project) => {
    const catalog = await new LocalCiDiscoveryService(availableRunner).discover(
      project,
    );

    assert.equal(catalog.provider, 'act');
    assert.equal(catalog.approximation, true);
    assert.deepEqual(catalog.availability, {
      state: 'available',
      actVersion: '0.2.82',
      dockerVersion: '27.5.1',
    });
    assert.deepEqual(catalog.jobs, [
      {
        workflowFile: '.github/workflows/ci.yml',
        workflow: 'CI',
        jobId: 'build',
        job: 'Build and test',
        events: ['push', 'pull_request'],
      },
    ]);
  });
});

test('projeto sem workflows produz catálogo vazio sem erro genérico', async () => {
  await withProject(null, async (project) => {
    const catalog = await new LocalCiDiscoveryService(availableRunner).discover(
      project,
    );
    assert.equal(catalog.availability.state, 'available');
    assert.deepEqual(catalog.jobs, []);
  });
});

test('act ausente é estado suportado e não impede discovery dos workflows', async () => {
  const runner: LocalCiDiscoveryCommandRunner = async (command) => {
    if (command.program === 'act') {
      const error = new Error('spawn act ENOENT /secret/path') as Error & {
        code?: string;
      };
      error.code = 'ENOENT';
      throw error;
    }
    return '27.5.1';
  };

  await withProject(
    `name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps: []\n`,
    async (project) => {
      const catalog = await new LocalCiDiscoveryService(runner).discover(
        project,
      );
      assert.equal(catalog.availability.state, 'act-missing');
      assert.equal(catalog.jobs.length, 1);
      assert.equal(JSON.stringify(catalog).includes('/secret/path'), false);
    },
  );
});

test('Docker daemon indisponível gera preflight acionável sem ecoar erro bruto', async () => {
  const runner: LocalCiDiscoveryCommandRunner = async (command) => {
    if (command.program === 'act') return 'act version 0.2.82';
    throw new Error('Cannot connect to unix:///secret/docker.sock');
  };

  await withProject(null, async (project) => {
    const catalog = await new LocalCiDiscoveryService(runner).discover(project);
    assert.equal(catalog.availability.state, 'docker-unavailable');
    assert.equal(catalog.availability.actVersion, '0.2.82');
    assert.equal(
      JSON.stringify(catalog).includes('/secret/docker.sock'),
      false,
    );
  });
});

test('workflow inválido fica fora do catálogo sem derrubar os demais domínios', async () => {
  await withProject('name: [yaml inválido', async (project) => {
    const catalog = await new LocalCiDiscoveryService(availableRunner).discover(
      project,
    );
    assert.equal(catalog.availability.state, 'available');
    assert.deepEqual(catalog.jobs, []);
  });
});
