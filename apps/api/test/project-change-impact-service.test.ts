import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import {
  classifyProjectChangeImpact,
  computeProjectChangeImpact,
} from '../src/services/project-change-impact-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args as string[], { cwd });
  return stdout.trim();
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-impact-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'init']);
  return root;
}

test('classifyProjectChangeImpact reconhece lockfile Node como dependencies', () => {
  const actions = classifyProjectChangeImpact(['package-lock.json']);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.category, 'dependencies');
  assert.deepEqual(actions[0]?.matchedPaths, ['package-lock.json']);
});

test('classifyProjectChangeImpact reconhece Gemfile.lock como dependencies', () => {
  const actions = classifyProjectChangeImpact(['Gemfile.lock']);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.category, 'dependencies');
});

test('classifyProjectChangeImpact reconhece migrations como database, inclusive multi-banco', () => {
  const actions = classifyProjectChangeImpact([
    'db/migrate/20240101000000_create_users.rb',
    'db/migrate_secondary/20240102000000_create_orders.rb',
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.category, 'database');
  assert.equal(actions[0]?.matchedPaths.length, 2);
});

test('classifyProjectChangeImpact reconhece .env.example e .env.sample como environment', () => {
  const actions = classifyProjectChangeImpact([
    '.env.example',
    'config/.env.sample',
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.category, 'environment');
});

test('classifyProjectChangeImpact reconhece Dockerfile/compose e config de servidor como server', () => {
  const actions = classifyProjectChangeImpact([
    'Dockerfile',
    'docker-compose.yml',
    'config/puma.rb',
    'config/sidekiq.yml',
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.category, 'server');
  assert.equal(actions[0]?.matchedPaths.length, 4);
});

test('classifyProjectChangeImpact reconhece arquivos de teste sem executar nada', () => {
  const actions = classifyProjectChangeImpact([
    'spec/models/user_spec.rb',
    'apps/web/src/components/Foo.test.ts',
    'test/user_test.rb',
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.category, 'tests');
  assert.equal(actions[0]?.matchedPaths.length, 3);
});

test('classifyProjectChangeImpact deduplica e ordena por prioridade fixa', () => {
  const actions = classifyProjectChangeImpact([
    'spec/models/user_spec.rb',
    'package-lock.json',
    'yarn.lock',
    'db/migrate/1_create_users.rb',
  ]);
  assert.deepEqual(
    actions.map((action) => action.category),
    ['dependencies', 'database', 'tests'],
  );
});

test('classifyProjectChangeImpact ignora caminhos irrelevantes ou fora do projeto', () => {
  const actions = classifyProjectChangeImpact([
    'app/models/user.rb',
    '../outside.lock',
    '/etc/passwd',
  ]);
  assert.deepEqual(actions, []);
});

test('computeProjectChangeImpact retorna vazio e seguro quando os SHAs são iguais', async () => {
  const root = await makeRepo();
  try {
    const sha = await git(root, ['rev-parse', 'HEAD']);
    const impact = await computeProjectChangeImpact(root, sha, sha);
    assert.deepEqual(impact, {
      previousSha: sha,
      currentSha: sha,
      changedPaths: [],
      actions: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('computeProjectChangeImpact retorna vazio e seguro para SHA inválido', async () => {
  const root = await makeRepo();
  try {
    const sha = await git(root, ['rev-parse', 'HEAD']);
    const impact = await computeProjectChangeImpact(
      root,
      sha,
      'not-a-sha; rm -rf /',
    );
    assert.deepEqual(impact.actions, []);
    assert.deepEqual(impact.changedPaths, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('computeProjectChangeImpact classifica o diff real entre dois commits', async () => {
  const root = await makeRepo();
  try {
    const previousSha = await git(root, ['rev-parse', 'HEAD']);
    await writeFile(path.join(root, 'package-lock.json'), '{}\n');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-q', '-m', 'chore: adiciona lockfile']);
    const currentSha = await git(root, ['rev-parse', 'HEAD']);

    const impact = await computeProjectChangeImpact(
      root,
      previousSha,
      currentSha,
    );
    assert.deepEqual(impact.changedPaths, ['package-lock.json']);
    assert.equal(impact.actions.length, 1);
    assert.equal(impact.actions[0]?.category, 'dependencies');
    assert.equal(impact.actions[0]?.routeName, 'project-dependencies');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
