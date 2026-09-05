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
  await mkdir(path.join(nodePath, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(nodePath, '.nvmrc'), '22.12.0\n');
  await writeFile(path.join(nodePath, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  await writeFile(path.join(nodePath, 'Dockerfile'), 'FROM node:22\n');
  await writeFile(path.join(nodePath, 'compose.yaml'), 'services: {}\n');
  await writeFile(path.join(nodePath, '.env.example'), 'TOKEN=super-secret\n');
  await writeFile(path.join(nodePath, '.env.test.example'), 'DATABASE_URL=test-secret\n');
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
      'ci/github-actions',
      'container/compose',
      'container/docker',
      'environment/contract-files',
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
  const environmentCapability = nodeProfile.capabilities.find(
    (entry) => entry.id === 'environment/contract-files',
  );
  assert.deepEqual(environmentCapability?.metadata?.files, [
    '.env.example',
    '.env.test.example',
  ]);
  assert.equal(JSON.stringify(environmentCapability).includes('super-secret'), false);
  assert.equal(JSON.stringify(environmentCapability).includes('test-secret'), false);

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
  await writeFile(path.join(railsPath, '.gitlab-ci.yml'), 'test:\n  script: bundle exec rspec\n');
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
  assert.equal(
    railsProfile.capabilities.some((entry) => entry.id === 'ci/gitlab'),
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
      throw new Error('secret-bearing provider detail');
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
    {
      provider: 'failing',
      message: 'Provider de profile falhou durante a detecção.',
    },
  ]);
  assert.equal(
    JSON.stringify(partial).includes('secret-bearing provider detail'),
    false,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
