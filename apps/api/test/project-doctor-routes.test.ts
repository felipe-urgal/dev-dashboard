import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type {
  Project,
  ProjectDiagnosticReport,
} from '@dev-dashboard/contracts';

const TOKEN = 'd'.repeat(64);

interface DoctorResponse {
  report: ProjectDiagnosticReport;
}

interface ErrorResponse {
  error?: string;
}

test('rota do Project Doctor', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-project-doctor-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample-node');
  await mkdir(path.join(projectPath, 'node_modules'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'sample-node',
      engines: { node: '>=22' },
    }),
  );
  await writeFile(path.join(projectPath, 'package-lock.json'), '{}\n');
  await writeFile(
    path.join(projectPath, '.env.example'),
    'DATABASE_URL=\nPUBLIC_URL=\n',
  );
  await writeFile(
    path.join(projectPath, '.env'),
    'DATABASE_URL=postgres://user:super-secret@localhost/sample\n',
  );

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { ProjectDoctorService } =
    await import('../src/services/project-doctor-service.js');

  let now = Date.parse('2026-08-05T12:00:00.000Z');
  let commandCalls = 0;
  const projectDoctorService = new ProjectDoctorService({
    now: () => now,
    cacheTtlMs: 60_000,
    commandRunner: async (command) => {
      commandCalls += 1;
      if (command === 'npm') return { stdout: '11.4.2\n', stderr: '' };
      throw new Error(`Comando inesperado: ${command}`);
    },
  });
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample-node',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
    capabilities: ['server'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
    projectDoctorService,
  });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    } else {
      process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    }
    if (previousStateDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    } else {
      process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    }
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test(
    'retorna diagnóstico sem expor valores do ambiente',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/doctor',
        headers,
      });

      assert.equal(response.statusCode, 200);
      const { report } = response.json<DoctorResponse>();
      assert.equal(report.projectId, 'p1');
      assert.equal(report.overallStatus, 'attention');
      assert.equal(report.summary.failed, 0);
      assert.equal(report.summary.warnings, 1);
      assert.equal(
        report.checks.find((check) => check.id === 'node-package-manager')
          ?.status,
        'passed',
      );
      const environmentCheck = report.checks.find(
        (check) => check.id === 'environment-variables',
      );
      assert.equal(environmentCheck?.status, 'warning');
      assert.match(environmentCheck?.summary ?? '', /PUBLIC_URL/);
      assert.doesNotMatch(response.body, /super-secret/);
    },
  );

  await context.test(
    'usa cache curto e permite atualização explícita',
    async () => {
      const cached = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/doctor',
        headers,
      });
      assert.equal(cached.statusCode, 200);
      assert.equal(commandCalls, 1);

      now += 1_000;
      const refreshed = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/doctor?refresh=true',
        headers,
      });
      assert.equal(refreshed.statusCode, 200);
      assert.equal(commandCalls, 2);
      assert.equal(
        refreshed.json<DoctorResponse>().report.generatedAt,
        '2026-08-05T12:00:01.000Z',
      );
    },
  );

  await context.test('retorna 404 para projeto inexistente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/doctor',
      headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/doctor',
    });
    assert.equal(response.statusCode, 401);
  });
});
