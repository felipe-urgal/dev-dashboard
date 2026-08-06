import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'c'.repeat(64);

interface CoverageResponse {
  coverage: {
    available: boolean;
    generatedAt?: string;
    total?: {
      statements: { total: number; covered: number; pct: number };
    };
    files?: Array<{ path: string }>;
  };
}

async function makeFixture(): Promise<{
  fixtureRoot: string;
  projectPath: string;
}> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-coverage-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'coverage'), { recursive: true });
  return { fixtureRoot, projectPath };
}

test('GET /projects/:projectId/coverage', async (context) => {
  const { fixtureRoot, projectPath } = await makeFixture();

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
    capabilities: ['tests'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('404 para projeto desconhecido', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/coverage',
      headers,
    });
    assert.equal(response.statusCode, 404);
  });

  await context.test('401 sem token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/coverage',
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test('available:false quando não há relatório', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/coverage',
      headers,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<CoverageResponse>().coverage, {
      available: false,
    });
  });

  await context.test(
    'expõe o resumo do SimpleCov quando o projeto é rails',
    async () => {
      const railsFixtureRoot = await mkdtemp(
        path.join(tmpdir(), 'dev-dashboard-coverage-routes-rails-'),
      );
      const railsProjectPath = path.join(railsFixtureRoot, 'sample-rails');
      await mkdir(path.join(railsProjectPath, 'coverage'), {
        recursive: true,
      });
      try {
        const railsProject: Project = {
          id: 'p-rails',
          name: 'sample-rails',
          path: railsProjectPath,
          type: 'rails',
          source: 'workspace',
          workspaceId: 'w2',
          favorite: false,
          capabilities: ['tests'],
        };
        appContext.projectStore.saveWorkspaceScan({
          workspaceId: 'w2',
          workspacePath: railsFixtureRoot,
          projects: [railsProject],
          warnings: [],
        });

        const filePath = path.join(
          railsProjectPath,
          'app',
          'models',
          'user.rb',
        );
        const resultset = {
          RSpec: {
            coverage: {
              [filePath]: { lines: [1, 0, null] },
            },
          },
        };
        await writeFile(
          path.join(railsProjectPath, 'coverage', '.resultset.json'),
          JSON.stringify(resultset),
        );

        const response = await app.inject({
          method: 'GET',
          url: '/api/projects/p-rails/coverage',
          headers,
        });
        assert.equal(response.statusCode, 200);
        const { coverage } = response.json<CoverageResponse>();
        assert.equal(coverage.available, true);
        assert.equal(coverage.total?.statements.total, 2);
        assert.equal(coverage.total?.statements.covered, 1);
        assert.equal(coverage.files?.[0]!.path, 'app/models/user.rb');
      } finally {
        await rm(railsFixtureRoot, { recursive: true, force: true });
      }
    },
  );

  await context.test(
    'expõe o resumo quando coverage-final.json existe',
    async () => {
      const filePath = path.join(projectPath, 'src', 'sum.ts');
      const report = {
        [filePath]: {
          statementMap: {
            '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
            '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 5 } },
          },
          s: { '0': 2, '1': 0 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {},
        },
      };
      await writeFile(
        path.join(projectPath, 'coverage', 'coverage-final.json'),
        JSON.stringify(report),
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/coverage',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { coverage } = response.json<CoverageResponse>();
      assert.equal(coverage.available, true);
      assert.ok(coverage.generatedAt);
      assert.equal(coverage.total?.statements.total, 2);
      assert.equal(coverage.total?.statements.covered, 1);
      assert.equal(coverage.files?.length, 1);
      assert.equal(coverage.files?.[0]!.path, 'src/sum.ts');
    },
  );
});
