import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ScriptDetectionService } from '../src/services/script-detection-service.js';
import { resolveCommand } from '../src/services/script-execution/command-resolution.js';

async function fixture(type: Project['type']): Promise<Project> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-dependencies-'),
  );
  return {
    id: path.basename(directory),
    name: 'demo',
    path: directory,
    type,
    source: 'standalone',
    enabled: true,
    capabilities: ['scripts'],
  };
}

test('detecta Yarn e expõe instalação e build com os comandos corretos', async () => {
  const project = await fixture('node');
  try {
    await writeFile(
      path.join(project.path, 'package.json'),
      JSON.stringify({
        scripts: { build: 'vite build', lint: 'eslint .' },
      }),
    );
    await writeFile(path.join(project.path, 'yarn.lock'), '# yarn lockfile');

    const service = new ScriptDetectionService();
    const catalog = await service.getCatalog(project);
    const install = catalog.items.find(
      (item) => item.id === 'package-manager:install',
    );
    const build = catalog.items.find(
      (item) => item.id === 'package-script:build',
    );

    assert.equal(install?.command, 'yarn install');
    assert.equal(install?.origin, 'package-manager');
    assert.equal(build?.command, 'yarn build');

    assert.deepEqual(await resolveCommand(project, install!), {
      command: 'yarn',
      args: ['install'],
    });
    assert.deepEqual(await resolveCommand(project, build!), {
      command: 'yarn',
      args: ['build'],
    });
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('projeto Rails com frontend recebe ações Bundler e Node', async () => {
  const project = await fixture('rails');
  try {
    await writeFile(path.join(project.path, 'Gemfile'), 'gem "rails"\n');
    await writeFile(
      path.join(project.path, 'package.json'),
      JSON.stringify({
        scripts: { build: 'webpack --mode production' },
      }),
    );
    await writeFile(path.join(project.path, 'package-lock.json'), '{}');

    const catalog = await new ScriptDetectionService().getCatalog(project);
    assert.deepEqual(
      catalog.items
        .filter((item) => item.origin === 'bundler')
        .map((item) => item.id)
        .sort(),
      ['bundler:check', 'bundler:install', 'bundler:update'],
    );
    assert.equal(
      catalog.items.find((item) => item.id === 'package-manager:install')
        ?.command,
      'npm install',
    );
    assert.equal(
      catalog.items.find((item) => item.id === 'package-script:build')?.command,
      'npm run build',
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});
