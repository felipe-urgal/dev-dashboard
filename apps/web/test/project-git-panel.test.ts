import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  GitDiffSnapshot,
  GitFileDiff,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitPanel from '../src/components/ProjectGitPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

interface RequestRecord {
  path: string;
  method: string;
  body?: unknown;
}

interface MountArgs {
  overview?: ProjectGitOverview;
  workspace?: ProjectGitWorkspace;
  diff?: GitDiffSnapshot;
  fileDiff?: (filePath: string) => GitFileDiff;
  handler?: (
    request: RequestRecord,
  ) => Response | Promise<Response> | undefined;
}

const jsonHeaders = { 'content-type': 'application/json' };

const latestCommit = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  subject: 'feat: melhora painel Git',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-07-29T10:00:00.000Z',
};

const baseOverview: ProjectGitOverview = {
  repository: true,
  branch: 'feature/git-ui',
  detached: false,
  upstream: 'origin/feature/git-ui',
  ahead: 1,
  behind: 0,
  clean: false,
  files: [
    {
      path: 'src/app.ts',
      indexStatus: 'M',
      worktreeStatus: '.',
      status: 'modified',
    },
  ],
  latestCommit,
  recentCommits: [latestCommit],
  stashes: [],
};

const baseWorkspace: ProjectGitWorkspace = {
  branches: [
    {
      name: 'feature/git-ui',
      shortName: 'feature/git-ui',
      kind: 'local',
      current: true,
      upstream: 'origin/feature/git-ui',
      ahead: 1,
      behind: 0,
      latestCommit,
    },
    {
      name: 'main',
      shortName: 'main',
      kind: 'local',
      current: false,
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      latestCommit: {
        ...latestCommit,
        hash: 'def123456789',
        shortHash: 'def1234',
        subject: 'chore: prepara projeto',
      },
    },
    {
      name: 'origin/feature/git-ui',
      shortName: 'feature/git-ui',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
      latestCommit,
    },
    {
      name: 'origin/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
      latestCommit: {
        ...latestCommit,
        hash: 'def123456789',
        shortHash: 'def1234',
        subject: 'chore: prepara projeto',
      },
    },
    {
      name: 'upstream/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
      latestCommit: {
        ...latestCommit,
        hash: 'fed123456789',
        shortHash: 'fed1234',
        subject: 'feat: versão principal',
        authorName: 'Equipe principal',
      },
    },
    {
      name: 'upstream/release/2.0',
      shortName: 'release/2.0',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
      latestCommit: {
        ...latestCommit,
        hash: '999123456789',
        shortHash: '9991234',
        subject: 'release: prepara 2.0',
      },
    },
  ],
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:felipe-urgal/projeto.git',
      pushUrl: 'git@github.com:felipe-urgal/projeto.git',
      role: 'origin',
    },
    {
      name: 'upstream',
      fetchUrl: 'git@github.com:caiena/projeto.git',
      pushUrl: 'git@github.com:caiena/projeto.git',
      role: 'upstream',
    },
  ],
  originComparison: {
    reference: 'origin/feature/git-ui',
    ahead: 1,
    behind: 0,
  },
  upstreamComparison: {
    reference: 'upstream/main',
    ahead: 4,
    behind: 2,
  },
};

const baseDiff: GitDiffSnapshot = {
  repository: true,
  scope: 'combined',
  files: [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      binary: false,
    },
    {
      path: 'README.md',
      status: 'modified',
      additions: 1,
      deletions: 0,
      binary: false,
    },
  ],
};

let cleanup: (() => void) | undefined;

beforeEach(() => {
  cleanup = undefined;
});

afterEach(() => {
  cleanup?.();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

async function mountPanel(args: MountArgs = {}) {
  const originalFetch = globalThis.fetch;
  const requests: RequestRecord[] = [];
  const overview = args.overview ?? baseOverview;
  const workspace = args.workspace ?? baseWorkspace;
  const diff = args.diff ?? baseDiff;

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input), 'http://localhost');
    const request: RequestRecord = {
      path: url.pathname,
      method: init?.method ?? 'GET',
      ...(init?.body
        ? { body: JSON.parse(String(init.body)) as unknown }
        : {}),
    };
    requests.push(request);

    const handled = await args.handler?.(request);
    if (handled) return handled;

    if (url.pathname.endsWith('/git/workspace')) {
      return jsonResponse({ workspace });
    }
    if (url.pathname.endsWith('/git/diff/file')) {
      const filePath = url.searchParams.get('path') ?? '';
      const file = args.fileDiff?.(filePath) ?? {
        path: filePath,
        scope: 'combined',
        status: 'modified',
        binary: false,
        content: '-const value = 1;\n+const value = 42;\n',
        truncated: false,
        masked: false,
        redactionCount: 0,
      } satisfies GitFileDiff;
      return jsonResponse({ file });
    }
    if (url.pathname.endsWith('/git/diff')) {
      return jsonResponse({ diff });
    }
    if (url.pathname.endsWith('/git')) {
      return jsonResponse({ git: overview });
    }

    return jsonResponse(
      { error: 'NOT_FOUND', message: 'Endpoint não encontrado.' },
      404,
    );
  }) as typeof fetch;

  const wrapper = mount(ProjectGitPanel, {
    props: { project: makeProject() },
  });
  await flushPromises();
  await flushPromises();

  return {
    wrapper,
    requests,
    restore: () => {
      wrapper.unmount();
      globalThis.fetch = originalFetch;
    },
  };
}

async function clickTab(
  wrapper: Awaited<ReturnType<typeof mountPanel>>['wrapper'],
  label: string,
): Promise<void> {
  const button = wrapper
    .findAll('.git-subtabs button')
    .find((candidate) => candidate.text() === label);
  assert.ok(button, `aba ${label} não encontrada`);
  await button.trigger('click');
  await flushPromises();
}

test('renderiza o resumo com comparações separadas de origin e upstream', async () => {
  const mounted = await mountPanel();
  cleanup = mounted.restore;

  const text = mounted.wrapper.text();
  assert.match(text, /Origin · publicação/);
  assert.match(text, /origin\/feature\/git-ui/);
  assert.match(text, /Upstream · base principal/);
  assert.match(text, /upstream\/main/);
  assert.match(text, /↑ 4 · ↓ 2/);
});

test('navega, filtra e exibe detalhes de branches remotas', async () => {
  const mounted = await mountPanel();
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Branches');

  assert.equal(mounted.wrapper.findAll('.git-table-row.branches-table').length, 6);
  assert.match(mounted.wrapper.text(), /Gerencie linhas de trabalho locais e remotas/);

  const upstreamFilter = mounted.wrapper
    .findAll('.branch-filter-tabs button')
    .find((button) => button.text() === 'Upstream');
  assert.ok(upstreamFilter);
  await upstreamFilter.trigger('click');
  await flushPromises();

  const rows = mounted.wrapper.findAll('.git-table-row.branches-table');
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.text(), /upstream\/main/);

  const release = rows.find((row) => row.text().includes('upstream/release/2.0'));
  assert.ok(release);
  await release.trigger('click');
  await flushPromises();

  const detail = mounted.wrapper.find('.branch-detail-panel');
  assert.match(detail.text(), /upstream\/release\/2.0/);
  assert.match(detail.text(), /release: prepara 2.0/);
  assert.match(detail.text(), /Criar local e trocar/);
});

test('cria branch local rastreando uma referência remota após confirmação', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    handler: (request) => {
      if (request.path.endsWith('/git/branches/track/confirmations')) {
        const body = request.body as { remoteBranch: string };
        return jsonResponse({
          confirmation: {
            token: 'r'.repeat(64),
            operation: 'track-branch',
            target: body.remoteBranch,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/branches/track')) {
        return jsonResponse({ branch: { branch: 'release/2.0' } }, 201);
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };
  await clickTab(mounted.wrapper, 'Branches');

  const release = mounted.wrapper
    .findAll('.branch-list-item')
    .find((row) => row.text().includes('upstream/release/2.0'));
  assert.ok(release);
  await release.trigger('click');
  await flushPromises();

  const trackButton = mounted.wrapper
    .findAll('.branch-detail-actions button')
    .find((button) => button.text().includes('Criar local e trocar'));
  assert.ok(trackButton);
  await trackButton.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmationIndex = mounted.requests.findIndex((request) =>
    request.path.endsWith('/git/branches/track/confirmations'),
  );
  const mutationIndex = mounted.requests.findIndex((request) =>
    request.path.endsWith('/git/branches/track'),
  );
  assert.ok(confirmationIndex >= 0);
  assert.ok(mutationIndex > confirmationIndex);
  assert.deepEqual(mounted.requests[mutationIndex]!.body, {
    remoteBranch: 'upstream/release/2.0',
    confirmationToken: 'r'.repeat(64),
  });
  assert.match(mounted.wrapper.text(), /Branch local "release\/2.0" criada rastreando "upstream\/release\/2.0"/);
});

test('cria branch normal pelo formulário moderno', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse({
          confirmation: {
            token: 't'.repeat(64),
            operation: body.operation,
            target: body.target,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/branches')) {
        const body = request.body as { name: string };
        return jsonResponse({ branch: { branch: body.name } }, 201);
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };
  await clickTab(mounted.wrapper, 'Branches');

  const createForm = mounted.wrapper.find('.branch-create-card form');
  await createForm.find('input').setValue('feature/nova');
  await createForm.trigger('submit');
  await flushPromises();
  await flushPromises();

  const confirmationIndex = mounted.requests.findIndex((request) =>
    request.path.endsWith('/git/mutations/confirmations'),
  );
  const mutationIndex = mounted.requests.findIndex((request) =>
    request.path.endsWith('/git/branches'),
  );
  assert.ok(confirmationIndex >= 0);
  assert.ok(mutationIndex > confirmationIndex);
  assert.equal(
    (mounted.requests[mutationIndex]!.body as { confirmationToken: string }).confirmationToken,
    't'.repeat(64),
  );
  assert.match(mounted.wrapper.text(), /Branch "feature\/nova" criada e selecionada/);
});

test('abre a página de diff e carrega o arquivo selecionado', async () => {
  const mounted = await mountPanel({
    fileDiff: (filePath) => ({
      path: filePath,
      scope: 'combined',
      status: 'modified',
      binary: false,
      content: '-const value = 1;\n+const value = 42;\n',
      truncated: false,
      masked: true,
      redactionCount: 1,
    }),
  });
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Diff');

  const files = mounted.wrapper.findAll('.git-diff-layout-modern aside button');
  assert.equal(files.length, 2);
  assert.match(files[0]!.text(), /src\/app\.ts/);
  assert.match(files[0]!.text(), /\+3 \/ −1/);

  await files[0]!.trigger('click');
  await flushPromises();

  assert.match(mounted.wrapper.text(), /Segredos detectados foram mascarados/);
  assert.match(mounted.wrapper.find('.git-diff-layout-modern pre').text(), /const value = 42/);
});

test('mostra o estado vazio na página de diff', async () => {
  const mounted = await mountPanel({
    overview: { ...baseOverview, clean: true, files: [] },
    diff: { repository: true, scope: 'combined', files: [] },
  });
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Diff');

  assert.match(mounted.wrapper.text(), /Nenhum arquivo alterado desde HEAD/);
});

test('push publica a branch no origin após confirmação', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse({
          confirmation: {
            token: 'p'.repeat(64),
            operation: body.operation,
            target: body.target,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/push')) {
        return jsonResponse({ branch: { branch: 'feature/git-ui' } });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  const pushButton = mounted.wrapper
    .findAll('.git-quick-actions button')
    .find((button) => button.text().includes('Push origin'));
  assert.ok(pushButton);
  await pushButton.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(mounted.requests.some((request) => request.path.endsWith('/git/push')));
  assert.match(mounted.wrapper.text(), /Push para origin concluído/);
});

test('abre a pull request calculada pela API quando a branch já está publicada', async () => {
  const originalConfirm = globalThis.confirm;
  const originalOpen = globalThis.open;
  globalThis.confirm = () => true;
  const openedUrls: string[] = [];
  globalThis.open = ((url: string | URL) => {
    openedUrls.push(String(url));
    return null;
  }) as typeof window.open;

  const mounted = await mountPanel({
    handler: (request) => {
      if (request.path.endsWith('/git/pull-request-url')) {
        return jsonResponse({
          pullRequest: {
            provider: 'github',
            url: 'https://github.com/felipe-urgal/projeto/compare/main...feature%2Fgit-ui?expand=1',
            branch: 'feature/git-ui',
            defaultBranch: 'main',
          },
        });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
    globalThis.open = originalOpen;
  };

  const prButton = mounted.wrapper
    .findAll('.git-quick-actions button')
    .find((button) => button.text().includes('Abrir pull request'));
  assert.ok(prButton);
  await prButton.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(mounted.requests.some((request) => request.path.endsWith('/git/pull-request-url')));
  assert.ok(!mounted.requests.some((request) => request.path.endsWith('/git/push')));
  assert.deepEqual(openedUrls, ['https://github.com/felipe-urgal/projeto/compare/main...feature%2Fgit-ui?expand=1']);
  assert.match(mounted.wrapper.text(), /Pull Request preparada/);
});

test('publica a branch antes de abrir a pull request quando ainda não há upstream', async () => {
  const originalConfirm = globalThis.confirm;
  const originalOpen = globalThis.open;
  globalThis.confirm = () => true;
  globalThis.open = (() => null) as typeof window.open;

  const mounted = await mountPanel({
    overview: (() => {
      const { upstream: _upstream, ...rest } = baseOverview;
      return rest;
    })(),
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse({
          confirmation: {
            token: 'p'.repeat(64),
            operation: body.operation,
            target: body.target,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/push')) {
        return jsonResponse({ branch: { branch: 'feature/git-ui' } });
      }
      if (request.path.endsWith('/git/pull-request-url')) {
        return jsonResponse({
          pullRequest: {
            provider: 'github',
            url: 'https://github.com/felipe-urgal/projeto/compare/main...feature%2Fgit-ui?expand=1',
            branch: 'feature/git-ui',
            defaultBranch: 'main',
          },
        });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
    globalThis.open = originalOpen;
  };

  const prButton = mounted.wrapper
    .findAll('.git-quick-actions button')
    .find((button) => button.text().includes('Abrir pull request'));
  assert.ok(prButton);
  await prButton.trigger('click');
  await flushPromises();
  await flushPromises();

  const requestPaths = mounted.requests.map((request) => request.path);
  assert.ok(requestPaths.some((path) => path.endsWith('/git/push')));
  assert.ok(requestPaths.some((path) => path.endsWith('/git/pull-request-url')));
  assert.match(mounted.wrapper.text(), /Pull Request preparada/);
});
