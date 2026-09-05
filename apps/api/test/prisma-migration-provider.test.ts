import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  PrismaMigrationProvider,
  type PrismaStatusRunner,
} from '../src/services/prisma-migration-provider.js';

async function withProject(
  callback: (project: Project) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-prisma-'));
  try {
    await mkdir(path.join(root, 'prisma'), { recursive: true });
    await writeFile(
      path.join(root, 'prisma', 'schema.prisma'),
      'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\n',
      'utf8',
    );
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

test('detecta schema Prisma conhecido e executa somente migrate status', async () => {
  await withProject(async (project) => {
    const calls: Array<{ projectPath: string; schemaFile: string }> = [];
    const runner: PrismaStatusRunner = async (projectPath, schemaFile) => {
      calls.push({ projectPath, schemaFile });
      return {
        exitCode: 0,
        stdout: 'Database schema is up to date!',
        stderr: '',
      };
    };

    const provider = new PrismaMigrationProvider(runner);
    assert.equal(provider.supports(project), true);

    const result = await provider.inspect({
      project,
      database: 'development',
      now: () => new Date('2026-09-05T20:00:00.000Z'),
    });

    assert.equal(result.status, 'up-to-date');
    assert.equal(result.database, 'development');
    assert.deepEqual(calls, [
      { projectPath: project.path, schemaFile: 'prisma/schema.prisma' },
    ]);
  });
});

test('P1001 vira unavailable sem ecoar host, URL ou credencial', async () => {
  await withProject(async (project) => {
    const runner: PrismaStatusRunner = async () => ({
      exitCode: 1,
      stdout: '',
      stderr:
        "Error: P1001: Can't reach database server at `postgres://user:secret@db.internal:5432/app`",
    });

    const result = await new PrismaMigrationProvider(runner).inspect({
      project,
    });
    const serialized = JSON.stringify(result);

    assert.equal(result.status, 'unavailable');
    assert.equal(serialized.includes('secret'), false);
    assert.equal(serialized.includes('db.internal'), false);
    assert.equal(serialized.includes('postgres://'), false);
  });
});

test('non-zero genérico permanece unknown em vez de inferir pending por texto livre', async () => {
  await withProject(async (project) => {
    const runner: PrismaStatusRunner = async () => ({
      exitCode: 1,
      stdout:
        'Following migration have not yet been applied: 20260905_secret_name',
      stderr: '',
    });

    const result = await new PrismaMigrationProvider(runner).inspect({
      project,
    });

    assert.equal(result.status, 'unknown');
    assert.deepEqual(result.pending, []);
    assert.equal(
      JSON.stringify(result).includes('20260905_secret_name'),
      false,
    );
  });
});

test('schema ausente e database identity malformada falham conservadoramente', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-prisma-empty-'),
  );
  try {
    const project: Project = {
      id: 'project-2',
      name: 'Sem Prisma',
      path: root,
      type: 'node',
      source: 'workspace',
      enabled: true,
      capabilities: [],
    };
    let called = false;
    const provider = new PrismaMigrationProvider(async () => {
      called = true;
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    assert.equal(provider.supports(project), false);
    const result = await provider.inspect({
      project,
      database: 'postgres://user:secret@host/db',
    });

    assert.equal(result.status, 'unavailable');
    assert.equal(result.database, 'primary');
    assert.equal(called, false);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
