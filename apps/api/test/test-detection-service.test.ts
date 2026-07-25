import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { TestDetectionService } from '../src/services/test-detection-service.js';

async function makeProject(
  type: Project['type'],
  files: Record<string, string> = {},
): Promise<Project> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-tests-'));
  for (const [relative, contents] of Object.entries(files)) {
    const filePath = path.join(directory, relative);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return {
    id: path.basename(directory),
    name: 'demo',
    path: directory,
    type,
    source: 'standalone',
    favorite: false,
    capabilities: [],
  };
}

test('detects vitest through package.json script', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.supported, true);
    assert.equal(overview.commands[0]?.runner, 'vitest');
    assert.equal(overview.commands[0]?.origin, 'package-script');
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('returns unsupported for a project without runners', async () => {
  const project = await makeProject('unknown');
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.supported, false);
    assert.deepEqual(overview.commands, []);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('detects rspec from Gemfile', async () => {
  const project = await makeProject('rails', {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
    'spec/spec_helper.rb': '',
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.supported, true);
    const rspec = overview.commands.find((command) => command.runner === 'rspec');
    assert.ok(rspec);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveCommand returns null for unknown ids', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  });
  try {
    const service = new TestDetectionService();
    await service.getOverview(project);
    const resolved = await service.resolveCommand(project, 'does-not-exist');
    assert.equal(resolved, null);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});
