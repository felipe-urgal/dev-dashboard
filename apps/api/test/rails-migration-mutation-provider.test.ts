import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import type { MigrationOverview } from '../src/services/migration-provider.js';
import { RailsMigrationMutationProvider } from '../src/services/rails-migration-mutation-provider.js';

async function projectFixture(
  files: Record<string, string>,
  type: Project['type'] = 'rails',
): Promise<Project> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'rails-mutation-provider-'),
  );
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return {
    id: 'project-1',
    name: 'Projeto',
    path: root,
    type,
    source: 'standalone',
    enabled: true,
    capabilities: [],
  };
}

function provider(): RailsMigrationMutationProvider {
  return new RailsMigrationMutationProvider({
    getMigrationsOverview: async () => ({
      supported: true,
      migrations: [],
    }),
  });
}

function overview(database = 'primary'): MigrationOverview {
  return {
    provider: 'rails',
    status: 'pending',
    database,
    applied: [],
    pending: [{ id: '20260919000100', name: 'CreateUsers' }],
    observedAt: '2026-09-19T18:30:00.000Z',
    evidence: 'Rails db:migrate:status',
    warnings: [],
  };
}

function context(project: Project): ExecutionContext {
  return {
    projectId: project.id,
    environmentInstanceId: `environment:primary:${project.id}`,
    cwd: project.path,
    runtime: 'host',
  };
}

test('Rails mutation provider planeja apply com bin/rails sem executar nada', async () => {
  const project = await projectFixture({
    'bin/rails': '#!/bin/sh\n',
    Gemfile: 'gem "rails"\n',
    'db/schema.rb': '',
  });
  const service = provider();

  const plan = await service.planMutation({
    project,
    executionContext: context(project),
    operation: 'apply',
    database: 'primary',
    overview: overview(),
    now: () => new Date('2026-09-19T18:31:00.000Z'),
  });

  assert.equal(service.supports(project), true);
  assert.deepEqual(plan, {
    command: {
      file: path.join(project.path, 'bin', 'rails'),
      args: ['db:migrate'],
    },
  });
});

test('Rails mutation provider usa bundle exec rails quando bin/rails não existe', async () => {
  const project = await projectFixture({
    Gemfile: 'gem "rails"\n',
    'db/schema.rb': '',
  });

  const plan = await provider().planMutation({
    project,
    executionContext: context(project),
    operation: 'apply',
    database: 'primary',
    overview: overview(),
    now: () => new Date(),
  });

  assert.deepEqual(plan.command, {
    file: 'bundle',
    args: ['exec', 'rails', 'db:migrate'],
  });
});

test('Rails mutation provider bloqueia database secundário e projeto multi-database', async () => {
  const single = await projectFixture({
    Gemfile: 'gem "rails"\n',
    'db/schema.rb': '',
  });

  await assert.rejects(
    () =>
      provider().planMutation({
        project: single,
        executionContext: context(single),
        operation: 'apply',
        database: 'analytics',
        overview: overview('analytics'),
        now: () => new Date(),
      }),
    /database secundário/u,
  );

  const multi = await projectFixture({
    Gemfile: 'gem "rails"\n',
    'db/schema.rb': '',
    'db/analytics_schema.rb': '',
  });

  await assert.rejects(
    () =>
      provider().planMutation({
        project: multi,
        executionContext: context(multi),
        operation: 'apply',
        database: 'primary',
        overview: overview(),
        now: () => new Date(),
      }),
    /multi-database/u,
  );
});

test('Rails mutation provider rejeita projeto sem comando Rails', async () => {
  const project = await projectFixture(
    {
      'package.json': '{}',
    },
    'node',
  );

  assert.equal(provider().supports(project), false);
  await assert.rejects(
    () =>
      provider().planMutation({
        project,
        executionContext: context(project),
        operation: 'apply',
        database: 'primary',
        overview: overview(),
        now: () => new Date(),
      }),
    /não se aplica/u,
  );
});
