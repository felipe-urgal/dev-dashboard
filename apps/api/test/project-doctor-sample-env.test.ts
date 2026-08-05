import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProjectDoctorService } from '../src/services/project-doctor-service.js';

test('Project Doctor usa .env.sample quando .env.example não existe', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-doctor-sample-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{"scripts":{"test":"vitest"}}');
  await writeFile(path.join(root, '.env.sample'), 'PUBLIC_URL=\nAPI_URL=\n');
  await writeFile(path.join(root, '.env'), 'PUBLIC_URL=http://localhost\n');

  const project: Project = {
    id: 'sample',
    workspaceId: 'w1',
    name: 'sample',
    path: root,
    type: 'node',
    source: 'workspace',
    favorite: false,
    capabilities: ['server'],
  };
  const report = await new ProjectDoctorService({
    commandRunner: async (command) => ({
      stdout: command === 'npm' ? '11.4.2\n' : 'v22.0.0\n',
      stderr: '',
    }),
  }).getReport(project);

  const environment = report.checks.find((check) => check.id === 'environment-variables');
  assert.equal(environment?.status, 'warning');
  assert.match(environment?.summary ?? '', /API_URL/);
  assert.doesNotMatch(environment?.summary ?? '', /\.env\.example e \.env\.sample não foram encontrados/);
});
