import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProjectDoctorService } from '../src/services/project-doctor-service.js';
import { parseToolVersions } from '../src/services/project-doctor/tool-versions.js';

function project(
  root: string,
  type: Project['type'],
  profile?: Project['profile'],
): Project {
  return {
    id: `${type}-toolchain-sources`,
    workspaceId: 'w1',
    name: `${type}-toolchain-sources`,
    path: root,
    type,
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
    ...(profile ? { profile } : {}),
  };
}

test('preserva declarações ambíguas de .tool-versions como evidência unknown', () => {
  assert.deepEqual(
    parseToolVersions('node 20.19.0 22.0.0\nruby\npnpm 9.15.0 # local\n'),
    [
      {
        tool: 'node',
        value: '<multiple:20.19.0,22.0.0>',
        source: '.tool-versions',
      },
      { tool: 'ruby', value: '<missing>', source: '.tool-versions' },
      { tool: 'pnpm', value: '9.15.0', source: '.tool-versions' },
    ],
  );
});

test('Node considera .tool-versions e não produz falso passed para versão incompatível', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-doctor-tools-node-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'node-tools' }),
  );
  await writeFile(path.join(root, '.tool-versions'), 'node 999.0.0\n');

  const report = await new ProjectDoctorService({
    commandRunner: async () => {
      throw new Error('nenhum gerenciador esperado');
    },
  }).getReport(project(root, 'node'));

  const runtime = report.checks.find((check) => check.id === 'node-runtime');
  assert.equal(runtime?.status, 'failed');
  assert.match(runtime?.summary ?? '', /\.tool-versions#node=999\.0\.0/);
});

test('múltiplos gerenciadores em .tool-versions ficam warning mesmo com lockfile', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-doctor-tools-pm-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'node-tools' }),
  );
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  await writeFile(
    path.join(root, '.tool-versions'),
    'pnpm 9.15.0\nyarn 4.5.0\n',
  );

  const calls: string[] = [];
  const report = await new ProjectDoctorService({
    commandRunner: async (command) => {
      calls.push(command);
      return { stdout: '9.15.0\n', stderr: '' };
    },
  }).getReport(project(root, 'node'));

  const manager = report.checks.find(
    (check) => check.id === 'node-package-manager',
  );
  assert.equal(manager?.status, 'warning');
  assert.match(manager?.summary ?? '', /múltiplos gerenciadores/);
  assert.match(manager?.summary ?? '', /pnpm/);
  assert.match(manager?.summary ?? '', /yarn/);
  assert.deepEqual(calls, []);
});

test('Ruby e Bundler validam Gemfile, lock e .tool-versions sem executar o Gemfile', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-doctor-tools-ruby-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'Gemfile'),
    "source 'https://rubygems.org'\nruby '3.3.0'\n",
  );
  await writeFile(
    path.join(root, 'Gemfile.lock'),
    'GEM\n\nBUNDLED WITH\n   2.5.6\n',
  );
  await writeFile(
    path.join(root, '.tool-versions'),
    'ruby 3.3.0\nbundler 2.5.6\n',
  );

  const calls: Array<[string, readonly string[]]> = [];
  const report = await new ProjectDoctorService({
    commandRunner: async (command, args) => {
      calls.push([command, args]);
      if (command === 'ruby') return { stdout: 'ruby 3.2.6p0\n', stderr: '' };
      if (command === 'bundle' && args[0] === '--version') {
        return { stdout: 'Bundler version 2.4.22\n', stderr: '' };
      }
      if (command === 'bundle' && args[0] === 'check') {
        return {
          stdout: 'The Gemfile dependencies are satisfied\n',
          stderr: '',
        };
      }
      throw new Error(`Comando inesperado: ${command} ${args.join(' ')}`);
    },
  }).getReport(project(root, 'rails'));

  const ruby = report.checks.find((check) => check.id === 'ruby-runtime');
  const bundler = report.checks.find(
    (check) => check.id === 'bundler-dependencies',
  );
  assert.equal(ruby?.status, 'failed');
  assert.match(ruby?.summary ?? '', /Gemfile#ruby=3\.3\.0/);
  assert.match(ruby?.summary ?? '', /\.tool-versions#ruby=3\.3\.0/);
  assert.equal(bundler?.status, 'failed');
  assert.match(bundler?.summary ?? '', /Gemfile\.lock#BUNDLED WITH=2\.5\.6/);
  assert.match(bundler?.summary ?? '', /\.tool-versions#bundler=2\.5\.6/);
  assert.equal(
    calls.some(([command]) => command === 'bash' || command === 'sh'),
    false,
  );
  assert.equal(
    calls.some(
      ([command, args]) => command === 'bundle' && args[0] === 'check',
    ),
    false,
  );
});

test('Compose explícito no Project Profile valida CLI e daemon Docker', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-doctor-compose-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const calls: string[] = [];
  const report = await new ProjectDoctorService({
    commandRunner: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (command !== 'docker') throw new Error('somente Docker esperado');
      if (args[0] === '--version') {
        return { stdout: 'Docker version 27.1.1, build abc\n', stderr: '' };
      }
      if (args[0] === 'compose') {
        return { stdout: 'Docker Compose version v2.29.1\n', stderr: '' };
      }
      if (args[0] === 'info') return { stdout: '27.1.1\n', stderr: '' };
      throw new Error(`args inesperados: ${args.join(' ')}`);
    },
  }).getReport(
    project(root, 'unknown', {
      capabilities: [
        {
          id: 'container/compose',
          provider: 'container',
          confidence: 'certain',
          evidence: [{ kind: 'file', source: 'compose.yml' }],
        },
      ],
      diagnostics: [],
    }),
  );

  const container = report.checks.find(
    (check) => check.id === 'container-toolchain',
  );
  assert.equal(container?.status, 'passed');
  assert.match(container?.summary ?? '', /Docker 27\.1\.1/);
  assert.match(container?.summary ?? '', /Compose 2\.29\.1/);
  assert.deepEqual(calls, [
    'docker --version',
    'docker compose version',
    'docker info --format {{.ServerVersion}}',
  ]);
});

test('Compose detectado com Docker ausente vira warning localizado', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-doctor-compose-missing-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const report = await new ProjectDoctorService({
    commandRunner: async () => {
      throw new Error('docker ausente');
    },
  }).getReport(
    project(root, 'unknown', {
      capabilities: [
        {
          id: 'container/compose',
          provider: 'container',
          confidence: 'certain',
          evidence: [{ kind: 'file', source: 'compose.yml' }],
        },
      ],
      diagnostics: [],
    }),
  );

  const container = report.checks.find(
    (check) => check.id === 'container-toolchain',
  );
  assert.equal(container?.status, 'warning');
  assert.match(container?.summary ?? '', /Compose/);
  assert.match(container?.summary ?? '', /não está disponível/);
});
