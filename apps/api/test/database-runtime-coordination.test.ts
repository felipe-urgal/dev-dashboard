import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { DatabaseDetectionService } from '../src/services/database-detection-service.js';

async function mysqlProject(): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'database-runtime-'));
  await writeFile(path.join(root, '.env'), 'DATABASE_URL=mysql2://user@localhost:3306/example\n');
  return {
    id: 'projeto',
    name: 'Projeto',
    path: root,
    type: 'rails',
    source: 'standalone',
    favorite: false,
    capabilities: ['database'],
  };
}

test('parar runtime Docker não encerra também o serviço systemd local', async () => {
  const project = await mysqlProject();
  const calls: string[] = [];
  const service = new DatabaseDetectionService(
    async (_command, args) => { calls.push(`systemd:${args.at(-2)}`); },
    {
      overview: async () => ({
        configured: true,
        dockerAvailable: true,
        composeFile: 'compose.yaml',
        services: [{
          name: 'mysql',
          image: 'mysql:8.0',
          requiresBuild: false,
          ports: ['3306:3306'],
          dependsOn: [],
          running: true,
        }],
      }),
      stopDatabaseServices: async () => {
        calls.push('docker:stop');
        return ['mysql'];
      },
    },
  );

  assert.equal(await service.stop(project, 'dotenv--env'), true);
  assert.deepEqual(calls, ['docker:stop']);
});

test('parar runtime local usa systemd quando não há container correspondente', async () => {
  const project = await mysqlProject();
  const calls: string[] = [];
  const service = new DatabaseDetectionService(
    async (_command, args) => { calls.push(`systemd:${args.at(-2)}`); },
    {
      overview: async () => ({ configured: false, dockerAvailable: false, services: [] }),
      stopDatabaseServices: async () => {
        calls.push('docker:check');
        return [];
      },
    },
  );

  assert.equal(await service.stop(project, 'dotenv--env'), true);
  assert.deepEqual(calls, ['docker:check', 'systemd:stop']);
});
