import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitPullRequestError,
  GitPullRequestService,
} from '../src/services/git-pull-request-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

interface RepositoryFixture {
  root: string;
  local: string;
  cleanup: () => Promise<void>;
}

async function createFixture(remoteUrl: string): Promise<RepositoryFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-pr-'));
  const local = path.join(root, 'local');

  await git(root, 'init', '--initial-branch=main', local);
  await git(local, 'config', 'user.name', 'Dashboard Test');
  await git(local, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(local, 'README.md'), '# Projeto\n');
  await git(local, 'add', 'README.md');
  await git(local, 'commit', '-m', 'initial');
  await git(local, 'remote', 'add', 'origin', remoteUrl);
  await git(local, 'update-ref', 'refs/remotes/origin/HEAD', 'refs/heads/main');
  await git(local, 'switch', '--create', 'feature/pull-request');
  await git(
    local,
    'update-ref',
    'refs/remotes/origin/feature/pull-request',
    'HEAD',
  );
  await git(
    local,
    'branch',
    '--set-upstream-to=origin/feature/pull-request',
    'feature/pull-request',
  );

  return {
    root,
    local,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test('compõe a URL de comparação do GitHub para o remote SSH', async () => {
  const fixture = await createFixture(
    'git@github.com:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    const result = await service.composeUrl(fixture.local);
    assert.equal(result.provider, 'github');
    assert.equal(result.branch, 'feature/pull-request');
    assert.equal(result.defaultBranch, 'main');
    assert.equal(
      result.url,
      'https://github.com/felipe-urgal/dev-dashboard/compare/main...feature%2Fpull-request?quick_pull=1',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('obtém o diff de revisão usando a branch base escolhida', async () => {
  const fixture = await createFixture(
    'git@github.com:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    await writeFile(
      path.join(fixture.local, 'README.md'),
      '# Projeto revisado\n',
    );
    await git(fixture.local, 'add', 'README.md');
    await git(fixture.local, 'commit', '-m', 'change for review');

    const result = await service.getReviewDiff(fixture.local, {
      targetRemote: 'origin',
      baseBranch: 'main',
    });

    assert.equal(result.targetRemote, 'origin');
    assert.equal(result.baseBranch, 'main');
    assert.equal(result.sourceBranch, 'feature/pull-request');
    assert.deepEqual(result.files, ['README.md']);
    assert.match(result.diff, /# Projeto revisado/);
  } finally {
    await fixture.cleanup();
  }
});

test('revisa uma branch local ainda não publicada', async () => {
  const fixture = await createFixture(
    'git@github.com:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    await git(fixture.local, 'switch', '--create', 'feature/local-review');
    await writeFile(path.join(fixture.local, 'README.md'), '# Revisão local\n');
    await git(fixture.local, 'add', 'README.md');
    await git(fixture.local, 'commit', '-m', 'local change for review');

    const result = await service.getReviewDiff(fixture.local, {
      targetRemote: 'origin',
      baseBranch: 'main',
    });

    assert.equal(result.sourceBranch, 'feature/local-review');
    assert.deepEqual(result.files, ['README.md']);
    assert.match(result.diff, /Revisão local/);
  } finally {
    await fixture.cleanup();
  }
});

test('obtém somente o patch do arquivo escolhido para a revisão com IA', async () => {
  const fixture = await createFixture(
    'git@github.com:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    await writeFile(path.join(fixture.local, 'README.md'), '# Revisado\n');
    await writeFile(
      path.join(fixture.local, 'app.ts'),
      'export const ok = true;\n',
    );
    await git(fixture.local, 'add', 'README.md', 'app.ts');
    await git(fixture.local, 'commit', '-m', 'change files for review');

    const result = await service.getReviewFileDiff(
      fixture.local,
      { targetRemote: 'origin', baseBranch: 'main' },
      'app.ts',
    );

    assert.deepEqual(result.files, ['README.md', 'app.ts']);
    assert.match(result.diff, /export const ok/);
    assert.doesNotMatch(result.diff, /# Revisado/);
  } finally {
    await fixture.cleanup();
  }
});

test('compõe a URL de merge request do GitLab e não vaza credenciais da URL https', async () => {
  const fixture = await createFixture(
    'https://user:s3cr3t@gitlab.com/felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    const result = await service.composeUrl(fixture.local);
    assert.equal(result.provider, 'gitlab');
    assert.doesNotMatch(result.url, /s3cr3t/);
    assert.doesNotMatch(result.url, /user/);
    assert.match(
      result.url,
      /^https:\/\/gitlab\.com\/felipe-urgal\/dev-dashboard\/-\/merge_requests\/new\?/,
    );
    assert.match(result.url, /source_branch.*feature%2Fpull-request/);
    assert.match(result.url, /target_branch.*main/);
  } finally {
    await fixture.cleanup();
  }
});

test('recusa quando o remote não é reconhecido', async () => {
  const fixture = await createFixture(
    'git@bitbucket.org:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    await assert.rejects(
      service.composeUrl(fixture.local),
      (error: unknown) =>
        error instanceof GitPullRequestError &&
        error.code === 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('recusa quando a branch atual é a branch padrão', async () => {
  const fixture = await createFixture(
    'git@github.com:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    await git(fixture.local, 'switch', 'main');
    await assert.rejects(
      service.composeUrl(fixture.local),
      (error: unknown) =>
        error instanceof GitPullRequestError &&
        error.code === 'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('recusa quando a branch ainda não foi publicada', async () => {
  const fixture = await createFixture(
    'git@github.com:felipe-urgal/dev-dashboard.git',
  );
  const service = new GitPullRequestService();

  try {
    await git(fixture.local, 'switch', '--create', 'feature/unpublished');
    await assert.rejects(
      service.composeUrl(fixture.local),
      (error: unknown) =>
        error instanceof GitPullRequestError &&
        error.code === 'GIT_PULL_REQUEST_NOT_PUBLISHED',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('recusa quando não há remote origin configurado', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-git-pr-no-origin-'),
  );
  const local = path.join(root, 'local');
  await git(root, 'init', '--initial-branch=main', local);
  await git(local, 'config', 'user.name', 'Dashboard Test');
  await git(local, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(local, 'README.md'), '# Projeto\n');
  await git(local, 'add', 'README.md');
  await git(local, 'commit', '-m', 'initial');
  await git(local, 'switch', '--create', 'feature/no-origin');

  const service = new GitPullRequestService();
  try {
    await assert.rejects(
      service.composeUrl(local),
      (error: unknown) =>
        error instanceof GitPullRequestError &&
        (error.code === 'GIT_PULL_REQUEST_NOT_PUBLISHED' ||
          error.code === 'GIT_REMOTE_NOT_CONFIGURED'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('recusa quando o projeto não é um repositório Git', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-git-pr-not-repo-'),
  );
  const service = new GitPullRequestService();
  try {
    await assert.rejects(
      service.composeUrl(root),
      (error: unknown) =>
        error instanceof GitPullRequestError &&
        error.code === 'GIT_NOT_REPOSITORY',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
