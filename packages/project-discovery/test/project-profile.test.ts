import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ProjectProfileProvider } from '@dev-dashboard/contracts';

import { detectProject, detectProjectProfile } from '../src/index.js';

const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-profile-'));

try {
  const nodePath = path.join(root, 'node-monorepo');
  await mkdir(path.join(nodePath, '.git'), { recursive: true });
  await writeFile(path.join(nodePath, '.nvmrc'), '22.12.0\n');
  await writeFile(path.join(nodePath, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  await writeFile(path.join(nodePath, 'Dockerfile'), 'FROM node:22\n');
  await writeFile(path.join(nodePath, 'compose.yaml'), 'services: {}\n');
  await writeFile(
    path.join(nodePath, 'package.json'),
    JSON.stringify({
      name: 'node-monorepo',
      packageManager: 'pnpm@9.15.0',
      scripts: { dev: 'vite', test: 'node --test' },
      dependencies: { fastify: '^5.0.0' },
      devDependencies: { vite: '^7.0.0', turbo: '^2.0.0' },
    }),
  );

  const nodeProfile = await detectProjectProfile({
    projectPath: nodePath,
    projectType: 'node',
  });
  assert.deepEqual(
    nodeProfile.capabilities.map((entry) => entry.id),
    [
      'container/compose',
      'container/docker',
      'framework/fastify',
      'framework/turbo',
      'framework/vite',
      'package-manager/pnpm',
      'runtime/node',
    ],
  );
  assert.equal(nodeProfile.diagnostics.length, 0);
  assert.equal(
    nodeProfile.capabilities.find((entry) => entry.id === 'runtime/node')
      ?.metadata?.declaredVersion,
    '22.12.0',
  );

  const detectedNode = await detectProject(nodePath);
  assert.ok(detectedNode);
  assert.equal(detectedNode.type, 'node');
  assert.ok(detectedNode.profile);
  assert.equal(detectedNode.capabilities.includes('git'), true);
  assert.equal(detectedNode.capabilities.includes('tests'), true);

  const railsPath = path.join(root, 'rails-app');
  await mkdir(railsPath, { recursive: true });
  await writeFile(path.join(railsPath, '.ruby-version'), '3.4.1\n');
  await writeFile(path.join(railsPath, 'Gemfile.lock'), 'BUNDLED WITH\n   2.6.2\n');
  const railsProfile = await detectProjectProfile({
    projectPath: railsPath,
    projectType: 'rails',
  });
  assert.equal(
    railsProfile.capabilities.some((entry) => entry.id === 'runtime/ruby'),
    true,
  );
  assert.equal(
    railsProfile.capabilities.some((entry) => entry.id === 'framework/rails'),
    true,
  );
  assert.equal(
    railsProfile.capabilities.some(
      (entry) => entry.id === 'package-manager/bundler',
    ),
    true,
  );

  const goodProvider: ProjectProfileProvider = {
    id: 'good',
    async detect() {
      return [
        {
          id: 'custom/good',
          provider: 'good',
          confidence: 'certain',
          evidence: [{ kind: 'config', source: 'fixture' }],
        },
      ];
    },
  };
  const failingProvider: ProjectProfileProvider = {
    id: 'failing',
    async detect() {
      throw new Error('fixture provider failed');
    },
  };

  const partial = await detectProjectProfile(
    { projectPath: root, projectType: 'unknown' },
    [goodProvider, failingProvider],
  );
  assert.deepEqual(partial.capabilities.map((entry) => entry.id), [
    'custom/good',
  ]);
  assert.deepEqual(partial.diagnostics, [
    { provider: 'failing', message: 'fixture provider failed' },
  ]);
} finally {
  await rm(root, { recursive: true, force: true });
}
