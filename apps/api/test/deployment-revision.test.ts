import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DeploymentError } from '../src/deployment/errors.js';
import { GitDeploymentRevisionResolver } from '../src/deployment/revision.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function makeRepository(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-revision-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  git(directory, 'init', '-b', 'main');
  git(directory, 'config', 'user.email', 'test@example.com');
  git(directory, 'config', 'user.name', 'Dev Dashboard Test');
  await writeFile(path.join(directory, 'package.json'), '{"name":"fixture"}\n');
  git(directory, 'add', 'package.json');
  git(directory, 'commit', '-m', 'fixture inicial');
  return directory;
}

function project(projectPath: string): Project {
  return {
    id: 'project-revision',
    name: 'fixture',
    path: projectPath,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
  };
}

test('resolver retorna branch e revisão somente com working tree limpa', async (t) => {
  const directory = await makeRepository(t);
  const resolved = await new GitDeploymentRevisionResolver().resolve(
    project(directory),
  );

  assert.equal(resolved.branch, 'main');
  assert.equal(resolved.revision, git(directory, 'rev-parse', 'HEAD'));
});

test('resolver bloqueia alteração rastreada ou arquivo não rastreado', async (t) => {
  const directory = await makeRepository(t);
  const resolver = new GitDeploymentRevisionResolver();

  await writeFile(
    path.join(directory, 'package.json'),
    '{"name":"alterado"}\n',
  );
  await assert.rejects(
    resolver.resolve(project(directory)),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_WORKTREE_DIRTY',
  );

  git(directory, 'restore', 'package.json');
  await writeFile(
    path.join(directory, 'nao-rastreado.txt'),
    'alteração local\n',
  );
  await assert.rejects(
    resolver.resolve(project(directory)),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_WORKTREE_DIRTY',
  );
});
