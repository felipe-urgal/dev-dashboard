import assert from 'node:assert/strict';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DatabaseDetectionService } from '../src/services/database-detection-service.js';
import {
  DATABASE_SNAPSHOT_RETENTION,
  DatabaseSnapshotError,
  DatabaseSnapshotService,
} from '../src/services/database-snapshot-service.js';

const DUMP_CONTENT = 'CREATE TABLE users (id INT);\nINSERT INTO users VALUES (1);\n';

interface Harness {
  project: Project;
  service: DatabaseSnapshotService;
  stateDirectory: string;
  restoreLog: string;
  cleanup: () => Promise<void>;
}

async function fakeBinary(directory: string, name: string, body: string): Promise<void> {
  const file = path.join(directory, name);
  await writeFile(file, `#!/usr/bin/env bash\n${body}\n`);
  await chmod(file, 0o755);
}

async function makeHarness(options: { databaseUrl?: string; binaries?: boolean } = {}): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-db-snapshot-'));
  const projectPath = path.join(root, 'projeto');
  const stateDirectory = path.join(root, 'state');
  const binDirectory = path.join(root, 'bin');
  await mkdir(projectPath, { recursive: true });
  await mkdir(stateDirectory, { recursive: true });
  await mkdir(binDirectory, { recursive: true });

  const databaseUrl = options.databaseUrl ?? 'mysql://dev:segredo@localhost:3306/app_development';
  await writeFile(path.join(projectPath, '.env'), `DATABASE_URL=${databaseUrl}\n`);

  const restoreLog = path.join(root, 'restore.sql');
  if (options.binaries !== false) {
    await fakeBinary(binDirectory, 'mysqldump', `cat <<'DUMP'
${DUMP_CONTENT.trimEnd()}
DUMP`);
    await fakeBinary(binDirectory, 'mysql', `cat > ${JSON.stringify(restoreLog)}`);
  }

  const originalPath = process.env.PATH ?? '';
  process.env.PATH = `${binDirectory}:${originalPath}`;

  const project: Project = {
    id: 'projeto-1',
    workspaceId: 'workspace-1',
    name: 'projeto',
    path: projectPath,
    type: 'node',
    capabilities: [],
  };

  return {
    project,
    service: new DatabaseSnapshotService(new DatabaseDetectionService(), stateDirectory),
    stateDirectory,
    restoreLog,
    cleanup: async () => {
      process.env.PATH = originalPath;
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function readGzip(file: string): Promise<string> {
  const chunks: Buffer[] = [];
  await pipeline(createReadStream(file), createGunzip(), async function* collect(source) {
    for await (const chunk of source) chunks.push(Buffer.from(chunk as Buffer));
  });
  return Buffer.concat(chunks).toString('utf8');
}

test('cria snapshot comprimido e o lista com metadados', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  const snapshot = await harness.service.create(harness.project, 'dotenv--env');
  assert.equal(snapshot.driver, 'mysql');
  assert.equal(snapshot.database, 'app_development');
  assert.ok(snapshot.sizeBytes > 0);

  const dump = path.join(harness.stateDirectory, 'db-snapshots', 'projeto-1', `${snapshot.id}.sql.gz`);
  assert.equal(await readGzip(dump), DUMP_CONTENT);

  const listed = await harness.service.list(harness.project);
  assert.equal(listed.total, 1);
  assert.equal(listed.snapshots[0]?.id, snapshot.id);
  assert.deepEqual(listed.supportedEnvironmentIds, ['dotenv--env']);
  // O caminho do arquivo nunca sai na resposta.
  assert.ok(!Object.keys(listed.snapshots[0] ?? {}).includes('file'));
});

test('recusa ambiente inexistente', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  await assert.rejects(
    () => harness.service.create(harness.project, 'inexistente'),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_ENVIRONMENT_NOT_FOUND',
  );
});

test('recusa adaptador sem suporte a dump', async (context) => {
  const harness = await makeHarness({ databaseUrl: 'sqlite3:///db/development.sqlite3' });
  context.after(harness.cleanup);

  const listed = await harness.service.list(harness.project);
  assert.deepEqual(listed.supportedEnvironmentIds, []);

  await assert.rejects(
    () => harness.service.create(harness.project, 'dotenv--env'),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_SNAPSHOT_UNSUPPORTED',
  );
});

test('avisa quando o cliente do banco não está no PATH', async (context) => {
  const harness = await makeHarness({ binaries: false });
  context.after(harness.cleanup);

  await assert.rejects(
    () => harness.service.create(harness.project, 'dotenv--env'),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_SNAPSHOT_TOOL_MISSING',
  );
});

test('restaura somente com confirmação válida e de uso único', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  const snapshot = await harness.service.create(harness.project, 'dotenv--env');

  await assert.rejects(
    () => harness.service.restore(harness.project, snapshot.id, 'a'.repeat(64)),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
  );

  const confirmation = await harness.service.prepareRestore(harness.project, snapshot.id);
  assert.equal(confirmation.snapshotId, snapshot.id);
  assert.equal(confirmation.token.length, 64);

  await harness.service.restore(harness.project, snapshot.id, confirmation.token);
  assert.equal(await readFile(harness.restoreLog, 'utf8'), DUMP_CONTENT);

  await assert.rejects(
    () => harness.service.restore(harness.project, snapshot.id, confirmation.token),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
  );
});

test('confirmação não vale para outro snapshot', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  const first = await harness.service.create(harness.project, 'dotenv--env');
  const second = await harness.service.create(harness.project, 'dotenv--env');
  const confirmation = await harness.service.prepareRestore(harness.project, first.id);

  await assert.rejects(
    () => harness.service.restore(harness.project, second.id, confirmation.token),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_RESTORE_CONFIRMATION_REQUIRED',
  );
});

test('recusa snapshot inexistente', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  await assert.rejects(
    () => harness.service.prepareRestore(harness.project, '11111111-2222-3333-4444-555555555555'),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_SNAPSHOT_NOT_FOUND',
  );
});

test('mantém apenas os snapshots mais recentes dentro da retenção', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  const created: string[] = [];
  for (let attempt = 0; attempt < DATABASE_SNAPSHOT_RETENTION + 2; attempt += 1) {
    const snapshot = await harness.service.create(harness.project, 'dotenv--env');
    created.push(snapshot.id);
    // createdAt tem resolução de milissegundo: garante a ordenação estável.
    await new Promise((resolve) => { setTimeout(resolve, 2); });
  }

  const listed = await harness.service.list(harness.project);
  assert.equal(listed.total, DATABASE_SNAPSHOT_RETENTION);
  assert.equal(listed.retentionLimit, DATABASE_SNAPSHOT_RETENTION);
  assert.equal(listed.snapshots[0]?.id, created.at(-1));
  assert.ok(!listed.snapshots.some((snapshot) => snapshot.id === created[0]));
});

test('falha do cliente vira erro de snapshot sem deixar arquivo pela metade', async (context) => {
  const harness = await makeHarness();
  context.after(harness.cleanup);

  const binDirectory = path.dirname(process.env.PATH?.split(':')[0] ?? '');
  await fakeBinary(
    path.join(binDirectory, 'bin'),
    'mysqldump',
    'echo "Access denied for user" >&2\nexit 1',
  );

  await assert.rejects(
    () => harness.service.create(harness.project, 'dotenv--env'),
    (error: unknown) => error instanceof DatabaseSnapshotError && error.code === 'DATABASE_SNAPSHOT_FAILED',
  );

  const listed = await harness.service.list(harness.project);
  assert.equal(listed.total, 0);
});
