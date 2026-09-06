import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  CustomMigrationProvider,
  type CustomMigrationStatusRunner,
} from '../src/services/custom-migration-provider.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

function config() {
  return {
    id: 'acme-migrations',
    command: {
      program: 'acme-migrate',
      args: ['status', '--quiet'],
    },
    projectTypes: ['node'] as const,
    upToDateExitCodes: [0],
    pendingExitCodes: [2],
    unavailableExitCodes: [3],
  };
}

test('executa argv estruturado no cwd do projeto e classifica códigos declarados', async () => {
  const calls: Array<{
    program: string;
    args: readonly string[];
    projectPath: string;
  }> = [];
  const runner: CustomMigrationStatusRunner = async (command, projectPath) => {
    calls.push({
      program: command.program,
      args: command.args,
      projectPath,
    });
    return { exitCode: 2 };
  };
  const provider = new CustomMigrationProvider(config(), runner);

  assert.equal(provider.supports(project), true);
  const result = await provider.inspect({
    project,
    database: 'development',
    now: () => new Date('2026-09-06T12:00:00.000Z'),
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.database, 'development');
  assert.deepEqual(result.pending, []);
  assert.deepEqual(calls, [
    {
      program: 'acme-migrate',
      args: ['status', '--quiet'],
      projectPath: project.path,
    },
  ]);
});

test('exit code sem semântica declarada permanece unknown', async () => {
  const provider = new CustomMigrationProvider(config(), async () => ({
    exitCode: 17,
  }));

  const result = await provider.inspect({ project });
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.pending, []);
});

test('falha de execução vira unavailable sem transportar erro bruto', async () => {
  const provider = new CustomMigrationProvider(config(), async () => {
    throw new Error(
      'connection postgres://user:secret@db.internal from /private/path',
    );
  });

  const result = await provider.inspect({ project });
  const serialized = JSON.stringify(result);

  assert.equal(result.status, 'unavailable');
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('db.internal'), false);
  assert.equal(serialized.includes('/private/path'), false);
});

test('provider não declarado para o projeto não executa runner', async () => {
  let called = false;
  const provider = new CustomMigrationProvider(
    {
      ...config(),
      projectTypes: ['rails'],
    },
    async () => {
      called = true;
      return { exitCode: 0 };
    },
  );

  assert.equal(provider.supports(project), false);
  const result = await provider.inspect({
    project,
    database: 'postgres://user:secret@host/db',
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.database, 'primary');
  assert.equal(called, false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('quando id e tipo são declarados, ambos precisam corresponder', () => {
  const wrongId = new CustomMigrationProvider({
    ...config(),
    projectIds: ['outro-projeto'],
  });
  const wrongType = new CustomMigrationProvider({
    ...config(),
    projectIds: [project.id],
    projectTypes: ['rails'],
  });
  const exact = new CustomMigrationProvider({
    ...config(),
    projectIds: [project.id],
  });

  assert.equal(wrongId.supports(project), false);
  assert.equal(wrongType.supports(project), false);
  assert.equal(exact.supports(project), true);
});

test('configuração ambígua ou capaz de abrir shell falha na construção', () => {
  assert.throws(
    () =>
      new CustomMigrationProvider({
        ...config(),
        command: { program: 'bash', args: ['-lc', 'echo unsafe'] },
      }),
    /não permitido/u,
  );

  assert.throws(
    () =>
      new CustomMigrationProvider({
        ...config(),
        pendingExitCodes: [0],
      }),
    /não pode significar/u,
  );

  assert.throws(
    () =>
      new CustomMigrationProvider({
        ...config(),
        projectTypes: [],
        projectIds: [],
      }),
    /precisa declarar/u,
  );
});
