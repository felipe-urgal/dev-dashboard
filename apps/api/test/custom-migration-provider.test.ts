import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  CustomMigrationMutationProvider,
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

test('pendingExitCodes pode ser omitido sem inventar pending', async () => {
  const { pendingExitCodes: _pendingExitCodes, ...withoutPending } = config();
  const provider = new CustomMigrationProvider(withoutPending, async () => ({
    exitCode: 2,
  }));

  const result = await provider.inspect({ project });
  assert.equal(result.status, 'unknown');
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

function mutationConfig() {
  return {
    ...config(),
    applyCommand: {
      program: 'acme-migrate',
      args: ['apply', '--non-interactive'],
    },
  };
}

function pendingOverview() {
  return {
    provider: 'acme-migrations',
    status: 'pending' as const,
    database: 'primary',
    applied: [],
    pending: [],
    observedAt: '2026-09-20T12:00:00.000Z',
    evidence: 'custom:acme-migrations:status',
    warnings: [],
  };
}

test('provider custom mutável produz somente argv apply estruturado com evidência pending do mesmo provider', async () => {
  const provider = new CustomMigrationMutationProvider(mutationConfig());

  const plan = await provider.planMutation({
    project,
    executionContext: {
      projectId: project.id,
      environmentInstanceId: 'environment:primary:project-1',
      cwd: project.path,
      runtime: 'host',
    },
    operation: 'apply',
    database: 'primary',
    overview: pendingOverview(),
    now: () => new Date('2026-09-20T12:00:00.000Z'),
  });

  assert.deepEqual(plan, {
    command: {
      file: 'acme-migrate',
      args: ['apply', '--non-interactive'],
    },
  });
});

test('provider custom read-only não ganha mutation implicitamente', () => {
  const provider = new CustomMigrationProvider(config());
  assert.equal('planMutation' in provider, false);
});

test('mutation custom falha fechado para database secundário ou evidência divergente', async () => {
  const provider = new CustomMigrationMutationProvider(mutationConfig());
  const baseContext = {
    project,
    executionContext: {
      projectId: project.id,
      environmentInstanceId: 'environment:primary:project-1',
      cwd: project.path,
      runtime: 'host' as const,
    },
    operation: 'apply' as const,
    database: 'primary',
    overview: pendingOverview(),
    now: () => new Date('2026-09-20T12:00:00.000Z'),
  };

  await assert.rejects(
    () =>
      provider.planMutation({
        ...baseContext,
        database: 'analytics',
      }),
    /database secundário/u,
  );

  await assert.rejects(
    () =>
      provider.planMutation({
        ...baseContext,
        overview: {
          ...pendingOverview(),
          provider: 'other-provider',
        },
      }),
    /evidência pending/u,
  );

  await assert.rejects(
    () =>
      provider.planMutation({
        ...baseContext,
        overview: {
          ...pendingOverview(),
          status: 'unknown',
        },
      }),
    /evidência pending/u,
  );
});

test('applyCommand custom reutiliza os mesmos guards contra shell e argumentos inseguros', () => {
  assert.throws(
    () =>
      new CustomMigrationMutationProvider({
        ...mutationConfig(),
        applyCommand: {
          program: 'sh',
          args: ['-c', 'acme-migrate apply'],
        },
      }),
    /não permitido/u,
  );

  assert.throws(
    () =>
      new CustomMigrationMutationProvider({
        ...mutationConfig(),
        applyCommand: {
          program: 'acme-migrate',
          args: ['apply\nunsafe'],
        },
      }),
    /Argumento custom inválido/u,
  );
});
