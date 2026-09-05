import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProjectDoctorService } from '../src/services/project-doctor-service.js';
import { evaluateVersionConstraint } from '../src/services/project-doctor/version-constraint.js';

function project(root: string, type: Project['type']): Project {
  return {
    id: `${type}-toolchain`,
    workspaceId: 'w1',
    name: `${type}-toolchain`,
    path: root,
    type,
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };
}

test('avalia constraints comuns sem adivinhar aliases não numéricos', () => {
  assert.equal(evaluateVersionConstraint('v22.12.0', '>=22 <23'), 'compatible');
  assert.equal(evaluateVersionConstraint('20.19.1', '^20.19.0'), 'compatible');
  assert.equal(evaluateVersionConstraint('20.20.0', '~20.19.0'), 'incompatible');
  assert.equal(evaluateVersionConstraint('22.4.0', '20.x || 22.x'), 'compatible');
  assert.equal(evaluateVersionConstraint('20.9.0', '>20'), 'incompatible');
  assert.equal(evaluateVersionConstraint('21.0.0', '>20'), 'compatible');
  assert.equal(evaluateVersionConstraint('20.1.9', '<=20.1'), 'compatible');
  assert.equal(evaluateVersionConstraint('20.2.0', '<=20.1'), 'incompatible');
  assert.equal(evaluateVersionConstraint('22.4.0', 'lts/*'), 'unknown');
});

test('Project Doctor bloqueia versões Node incompatíveis com evidência explícita', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-toolchain-node-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'node-toolchain',
      engines: { node: '>=999.0.0' },
      packageManager: 'pnpm@9.15.0',
    }),
  );
  await writeFile(path.join(root, '.nvmrc'), '>=999.0.0\n');
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');

  const report = await new ProjectDoctorService({
    commandRunner: async (command) => {
      if (command === 'pnpm') return { stdout: '8.15.0\n', stderr: '' };
      throw new Error(`Comando inesperado: ${command}`);
    },
  }).getReport(project(root, 'node'));

  const nodeRuntime = report.checks.find((check) => check.id === 'node-runtime');
  const packageManager = report.checks.find(
    (check) => check.id === 'node-package-manager',
  );
  assert.equal(nodeRuntime?.status, 'failed');
  assert.match(nodeRuntime?.summary ?? '', /package\.json#engines\.node=>?=999\.0\.0/);
  assert.match(nodeRuntime?.summary ?? '', /\.nvmrc=>?=999\.0\.0/);
  assert.equal(packageManager?.status, 'failed');
  assert.match(packageManager?.summary ?? '', /pnpm 8\.15\.0/);
  assert.match(packageManager?.summary ?? '', /package\.json#packageManager=pnpm@9\.15\.0/);
});

test('packageManager explícito prevalece como fonte e conflito de lockfile vira atenção', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-toolchain-manager-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'manager-toolchain', packageManager: 'pnpm@9.15.0' }),
  );
  await writeFile(path.join(root, 'package-lock.json'), '{}\n');

  const report = await new ProjectDoctorService({
    commandRunner: async (command) => {
      if (command === 'pnpm') return { stdout: '9.15.0\n', stderr: '' };
      throw new Error(`Comando inesperado: ${command}`);
    },
  }).getReport(project(root, 'node'));

  const packageManager = report.checks.find(
    (check) => check.id === 'node-package-manager',
  );
  assert.equal(packageManager?.status, 'warning');
  assert.match(packageManager?.summary ?? '', /package-lock\.json/);
  assert.match(packageManager?.summary ?? '', /pnpm 9\.15\.0/);
});

test('ferramenta Node ausente não impede os demais diagnósticos', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-toolchain-missing-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'missing-manager',
      engines: { node: '>=0' },
      packageManager: 'pnpm@9.15.0',
    }),
  );
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');

  const report = await new ProjectDoctorService({
    commandRunner: async () => {
      throw new Error('pnpm ausente');
    },
  }).getReport(project(root, 'node'));

  assert.equal(
    report.checks.find((check) => check.id === 'node-runtime')?.status,
    'passed',
  );
  assert.equal(
    report.checks.find((check) => check.id === 'node-package-manager')?.status,
    'warning',
  );
  assert.equal(
    report.checks.find((check) => check.id === 'node-dependencies')?.status,
    'passed',
  );
});

test('Project Doctor compara Ruby local com .ruby-version', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-toolchain-ruby-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Gemfile'), "source 'https://rubygems.org'\n");
  await writeFile(path.join(root, 'Gemfile.lock'), 'GEM\n\n');
  await writeFile(path.join(root, '.ruby-version'), '3.3.0\n');

  const report = await new ProjectDoctorService({
    commandRunner: async (command, args) => {
      if (command === 'ruby') return { stdout: 'ruby 3.2.6p0\n', stderr: '' };
      if (command === 'bundle' && args[0] === 'check') {
        return { stdout: 'The Gemfile dependencies are satisfied\n', stderr: '' };
      }
      throw new Error(`Comando inesperado: ${command}`);
    },
  }).getReport(project(root, 'rails'));

  const rubyRuntime = report.checks.find((check) => check.id === 'ruby-runtime');
  assert.equal(rubyRuntime?.status, 'failed');
  assert.match(rubyRuntime?.summary ?? '', /Ruby 3\.2\.6/);
  assert.match(rubyRuntime?.summary ?? '', /\.ruby-version=3\.3\.0/);
});
