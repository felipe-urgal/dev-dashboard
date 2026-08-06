import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 's'.repeat(64);

interface SnapshotListResponse {
  snapshots: {
    snapshots: Array<{
      id: string;
      database: string;
      label: string;
      sizeBytes: number;
    }>;
    total: number;
    retentionLimit: number;
    supportedEnvironmentIds: string[];
  };
}
interface SnapshotResponse {
  snapshot: { id: string; database: string; driver: string };
}
interface ConfirmationResponse {
  confirmation: { token: string; snapshotId: string; expiresAt: string };
}
interface RestoreResponse {
  restore: { snapshotId: string; restored: boolean };
}
interface ErrorResponse {
  error?: string;
}

test('rotas de snapshot e restore do banco', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-db-snapshot-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  const binDirectory = path.join(fixtureRoot, 'bin');
  await mkdir(projectPath, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  await writeFile(
    path.join(projectPath, '.env'),
    'DATABASE_URL=postgresql://dev:segredo@localhost:5432/app_development\n',
  );

  const restoreLog = path.join(fixtureRoot, 'restore.sql');
  await writeFile(
    path.join(binDirectory, 'pg_dump'),
    '#!/usr/bin/env bash\necho "SELECT 1;"\n',
  );
  await writeFile(
    path.join(binDirectory, 'psql'),
    `#!/usr/bin/env bash\ncat > ${JSON.stringify(restoreLog)}\n`,
  );
  await chmod(path.join(binDirectory, 'pg_dump'), 0o755);
  await chmod(path.join(binDirectory, 'psql'), 0o755);

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  const previousPath = process.env.PATH;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');
  process.env.PATH = `${binDirectory}:${previousPath ?? ''}`;

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
    capabilities: [],
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
    process.env.PATH = previousPath;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };
  let snapshotId = '';

  await context.test('exige o token nas rotas de snapshot', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/database/snapshots',
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test(
    'lista vazia informa retenção e ambientes compatíveis',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/database/snapshots',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { snapshots } = response.json<SnapshotListResponse>();
      assert.equal(snapshots.total, 0);
      assert.equal(snapshots.retentionLimit, 10);
      assert.deepEqual(snapshots.supportedEnvironmentIds, ['dotenv--env']);
    },
  );

  await context.test('cria um snapshot para o ambiente detectado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/database/snapshots',
      headers,
      payload: { environmentId: 'dotenv--env' },
    });
    assert.equal(response.statusCode, 200);
    const { snapshot } = response.json<SnapshotResponse>();
    assert.equal(snapshot.database, 'app_development');
    assert.equal(snapshot.driver, 'postgresql');
    snapshotId = snapshot.id;
  });

  await context.test(
    'ignora campos de conexão enviados pelo navegador',
    async () => {
      // O schema declara additionalProperties: false e o Fastify remove o excedente:
      // host e database do corpo nunca chegam ao serviço.
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/database/snapshots',
        headers,
        payload: {
          environmentId: 'dotenv--env',
          host: 'servidor-externo',
          database: 'outro',
        },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(
        response.json<SnapshotResponse>().snapshot.database,
        'app_development',
      );
    },
  );

  await context.test('recusa id de snapshot fora do formato UUID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/database/snapshots/..%2Fescape/restore/confirmation',
      headers,
      payload: {},
    });
    assert.equal(response.statusCode, 400);
  });

  await context.test('restore sem confirmação válida é recusado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/p1/database/snapshots/${snapshotId}/restore`,
      headers,
      payload: { confirmationToken: 'f'.repeat(64) },
    });
    assert.equal(response.statusCode, 409);
    assert.equal(
      response.json<ErrorResponse>().error,
      'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
    );
  });

  await context.test(
    'restaura em duas etapas e devolve apenas metadados',
    async () => {
      const prepared = await app.inject({
        method: 'POST',
        url: `/api/projects/p1/database/snapshots/${snapshotId}/restore/confirmation`,
        headers,
        payload: {},
      });
      assert.equal(prepared.statusCode, 200);
      const { confirmation } = prepared.json<ConfirmationResponse>();
      assert.equal(confirmation.snapshotId, snapshotId);

      const restored = await app.inject({
        method: 'POST',
        url: `/api/projects/p1/database/snapshots/${snapshotId}/restore`,
        headers,
        payload: { confirmationToken: confirmation.token },
      });
      assert.equal(restored.statusCode, 200);
      assert.deepEqual(restored.json<RestoreResponse>().restore, {
        snapshotId,
        restored: true,
      });
    },
  );

  await context.test(
    'a listagem nunca expõe caminho de arquivo do dump',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/database/snapshots',
        headers,
      });
      const { snapshots } = response.json<SnapshotListResponse>();
      assert.equal(snapshots.total, 2);
      assert.ok(!response.payload.includes(fixtureRoot));
      assert.ok(!Object.keys(snapshots.snapshots[0] ?? {}).includes('file'));
    },
  );

  await context.test('projeto inexistente responde 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/desconhecido/database/snapshots',
      headers,
    });
    assert.equal(response.statusCode, 404);
  });
});
