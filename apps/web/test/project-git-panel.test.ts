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

const commitOverview: ProjectGitOverview = {
  ...baseOverview,
  branch: 'main',
  upstream: 'origin/main',
  clean: false,
  files: [
    {
      path: 'src/staged.ts',
      indexStatus: 'M',
      worktreeStatus: '.',
      status: 'modified',
    },
    {
      path: 'src/styles.css',
      indexStatus: 'M',
      worktreeStatus: '.',
      status: 'modified',
    },
    {
      path: 'src/app.ts',
      indexStatus: '.',
      worktreeStatus: 'M',
      status: 'modified',
    },
    {
      path: 'README.md',
      indexStatus: '.',
      worktreeStatus: 'M',
      status: 'modified',
    },
    {
      path: 'src/new-file.ts',
      indexStatus: '?',
      worktreeStatus: '?',
      status: 'untracked',
    },
  ],
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
    global: {
      stubs: {
        Teleport: true,
      },
    },
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

test('abre diretamente em sincronização e mantém branches como segunda aba', async () => {
  const mounted = await mountPanel();
  cleanup = mounted.restore;

  const text = mounted.wrapper.text();
  const tabLabels = mounted.wrapper
    .findAll('.git-subtabs button')
    .map((button) => button.text());
  assert.doesNotMatch(text, /Resumo/);
  assert.doesNotMatch(text, /Histórico recente/);
  assert.doesNotMatch(text, /upstream\//);
  assert.doesNotMatch(tabLabels.join(' '), /Stash/);
  assert.match(text, /main\s*→\s*origin\/main/);
  assert.match(text, /Sincronizar/);
  assert.ok(
    mounted.wrapper
      .findAll('.git-subtabs button')
      .find((button) => button.text() === 'Sincronização')
      ?.classes('active'),
  );
  assert.deepEqual(
    tabLabels,
    ['Sincronização', 'Branches', 'Commit', 'Diff', 'Histórico'],
  );
  assert.ok(!mounted.wrapper.find('.git-server-indicator').exists());
});

test('lista branches locais e origin sem expor ações de sincronização', async () => {
  const mounted = await mountPanel({
    workspace: {
      ...baseWorkspace,
      branches: [
        ...baseWorkspace.branches,
        {
          name: 'origin/release/2.0',
          shortName: 'release/2.0',
          kind: 'remote',
          current: false,
          remote: 'origin',
          ahead: 0,
          behind: 0,
          latestCommit,
        },
      ],
    },
  });
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Branches');

  assert.equal(mounted.wrapper.findAll('.branch-table-row').length, 3);
  assert.match(mounted.wrapper.text(), /release\/2.0/);
  assert.doesNotMatch(mounted.wrapper.text(), /upstream\/release\/2.0/);

  const remoteFilter = mounted.wrapper
    .findAll('.branch-filter-tabs button')
    .find((button) => button.text() === 'Remotas');
  assert.ok(remoteFilter);
  await remoteFilter.trigger('click');
  await flushPromises();

  const rows = mounted.wrapper.findAll('.branch-table-row');
  assert.equal(rows.length, 3);
  const release = rows.find((row) => row.text().includes('release/2.0'));
  assert.ok(release);
  assert.match(release.text(), /Somente remota/);
  assert.match(release.text(), /Somente leitura/);
});

test('cria branch com prefixo pelo modal centralizado', async () => {
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
  await mounted.wrapper.find('.branch-create-button').trigger('click');
  const createForm = mounted.wrapper.find('.branch-modal-form');
  assert.ok(createForm.exists());
  assert.match(mounted.wrapper.find('.branch-modal').text(), /Nova branch/);
  await createForm.find('select').setValue('bugfix/');
  await mounted.wrapper
    .find('.branch-modal-form input:not([readonly])')
    .setValue('correcao-botao');
  await flushPromises();
  assert.equal(
    (
      mounted.wrapper.find('.branch-modal-form input[readonly]')
        .element as HTMLInputElement
    ).value,
    'bugfix/correcao-botao',
  );
  await mounted.wrapper.find('.branch-modal-form').trigger('submit');
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
  assert.equal(
    (mounted.requests[mutationIndex]!.body as { name: string }).name,
    'bugfix/correcao-botao',
  );
  assert.match(
    mounted.wrapper.text(),
    /Branch "bugfix\/correcao-botao" criada e selecionada/,
  );
});

test('renomeia uma branch local pelo menu de ações', async () => {
  const mounted = await mountPanel({
    handler: (request) => {
      if (request.path.endsWith('/git/branches/rename/confirmations')) {
        const body = request.body as {
          currentName: string;
          nextName: string;
        };
        return jsonResponse({
          confirmation: {
            token: 'n'.repeat(64),
            operation: 'rename-branch',
            ...body,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/branches/rename')) {
        const body = request.body as { nextName: string };
        return jsonResponse({ branch: { branch: body.nextName } });
      }
      return undefined;
    },
  });
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Branches');

  const currentRow = mounted.wrapper
    .findAll('.branch-table-row')
    .find((row) => row.text().includes('feature/git-ui'));
  assert.ok(currentRow);
  await currentRow.find('.branch-menu-trigger').trigger('click');
  const renameAction = currentRow
    .findAll('.branch-menu-popover button')
    .find((button) => button.text().includes('Renomear'));
  assert.ok(renameAction);
  await renameAction.trigger('click');

  const renameForm = mounted.wrapper.find('.branch-modal-form');
  await renameForm.find('input').setValue('feature/git-ui-renamed');
  await renameForm.trigger('submit');
  await flushPromises();
  await flushPromises();

  const mutation = mounted.requests.find((request) =>
    request.path.endsWith('/git/branches/rename')
    && !request.path.endsWith('/confirmations'),
  );
  assert.deepEqual(mutation?.body, {
    currentName: 'feature/git-ui',
    nextName: 'feature/git-ui-renamed',
    confirmationToken: 'n'.repeat(64),
  });
  assert.match(
    mounted.wrapper.text(),
    /Branch "feature\/git-ui" renomeada para "feature\/git-ui-renamed"/,
  );
});

test('remove uma branch local após confirmação digitada', async () => {
  const removableBranch: ProjectGitWorkspace['branches'][number] = {
    name: 'bugfix/old',
    shortName: 'bugfix/old',
    kind: 'local',
    current: false,
    ahead: 0,
    behind: 0,
    latestCommit,
  };
  const mounted = await mountPanel({
    workspace: {
      ...baseWorkspace,
      branches: [...baseWorkspace.branches, removableBranch],
    },
    handler: (request) => {
      if (request.path.endsWith('/git/branches/delete/confirmations')) {
        return jsonResponse({
          confirmation: {
            token: 'd'.repeat(64),
            operation: 'delete-branch',
            target: 'bugfix/old',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/branches/delete')) {
        return jsonResponse({ branch: { branch: 'bugfix/old' } });
      }
      return undefined;
    },
  });
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Branches');

  const row = mounted.wrapper
    .findAll('.branch-table-row')
    .find((candidate) => candidate.text().includes('bugfix/old'));
  assert.ok(row);
  await row.find('.branch-menu-trigger').trigger('click');
  const deleteAction = row
    .findAll('.branch-menu-popover button')
    .find((button) => button.text().includes('Remover branch'));
  assert.ok(deleteAction);
  await deleteAction.trigger('click');

  const deleteForm = mounted.wrapper.find('.branch-delete-form');
  const submit = deleteForm.find('button[type="submit"]');
  assert.ok(submit.attributes('disabled') !== undefined);
  await deleteForm.find('input').setValue('bugfix/old');
  await flushPromises();
  assert.equal(
    (
      mounted.wrapper.find('.branch-delete-form button[type="submit"]')
        .element as HTMLButtonElement
    ).disabled,
    false,
  );
  await mounted.wrapper.find('.branch-delete-form').trigger('submit');
  await flushPromises();
  await flushPromises();

  const mutation = mounted.requests.find((request) =>
    request.path.endsWith('/git/branches/delete')
    && !request.path.endsWith('/confirmations'),
  );
  assert.deepEqual(mutation?.body, {
    branch: 'bugfix/old',
    confirmationToken: 'd'.repeat(64),
  });
  assert.match(mounted.wrapper.text(), /Branch "bugfix\/old" removida/);
});

test('renderiza o commit como um fluxo linear com arquivos e composer', async () => {
  const mounted = await mountPanel({ overview: commitOverview });
  cleanup = mounted.restore;

  await clickTab(mounted.wrapper, 'Commit');

  assert.match(mounted.wrapper.text(), /Preparar e registrar alterações/);
  assert.equal(mounted.wrapper.findAll('.git-commit-file-row').length, 5);
  assert.ok(mounted.wrapper.find('.git-commit-steps').exists());
  assert.ok(mounted.wrapper.find('.git-commit-composer').exists());
  assert.ok(!mounted.wrapper.find('.commit-metrics').exists());
  assert.ok(!mounted.wrapper.find('.git-commit-layout').exists());

  const modifiedFilter = mounted.wrapper
    .findAll('.git-commit-filter-tabs button')
    .find((button) => button.text().includes('Modificados'));
  assert.ok(modifiedFilter);
  await modifiedFilter.trigger('click');
  assert.equal(mounted.wrapper.findAll('.git-commit-file-row').length, 2);

  const feat = mounted.wrapper
    .findAll('.git-commit-types button')
    .find((button) => button.text() === 'feat');
  assert.ok(feat);
  await feat.trigger('click');
  assert.equal(
    (mounted.wrapper.find('.git-commit-composer textarea').element as HTMLTextAreaElement).value,
    'feat: ',
  );
});

test('abre a aba Diff já focada no arquivo escolhido no Commit', async () => {
  const mounted = await mountPanel({ overview: commitOverview });
  cleanup = mounted.restore;

  await clickTab(mounted.wrapper, 'Commit');

  const row = mounted.wrapper
    .findAll('.git-commit-file-row')
    .find((candidate) => candidate.text().includes('src/app.ts'));
  assert.ok(row);
  await row.find('.git-commit-diff-button').trigger('click');
  await flushPromises();

  assert.match(mounted.wrapper.text(), /Diferenças por arquivo/);
  assert.match(mounted.wrapper.find('.git-diff-layout-modern pre').text(), /const value = 42/);
  assert.ok(
    mounted.requests.some((request) =>
      request.path.endsWith('/git/diff/file'),
    ),
  );
});

test('confirma antes de desfazer modificado ou remover arquivo novo', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: commitOverview,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse({
          confirmation: {
            token: 'f'.repeat(64),
            operation: body.operation,
            target: body.target,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (
        request.path.endsWith('/git/files/discard')
        || request.path.endsWith('/git/files/remove')
      ) {
        const body = request.body as { path: string };
        return jsonResponse({ file: { path: body.path } });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  await clickTab(mounted.wrapper, 'Commit');

  const discard = mounted.wrapper
    .findAll('.git-commit-danger-button')
    .find((button) => button.text().includes('Desfazer alterações'));
  assert.ok(discard);
  await discard.trigger('click');
  await flushPromises();
  await flushPromises();

  const remove = mounted.wrapper
    .findAll('.git-commit-danger-button')
    .find((button) => button.text().includes('Remover arquivo'));
  assert.ok(remove);
  await remove.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmations = mounted.requests
    .filter((request) => request.path.endsWith('/git/mutations/confirmations'))
    .map((request) => request.body);
  assert.deepEqual(confirmations, [
    { operation: 'discard-file', target: 'src/app.ts' },
    { operation: 'remove-untracked-file', target: 'src/new-file.ts' },
  ]);
  assert.ok(
    mounted.requests.some((request) =>
      request.path.endsWith('/git/files/discard'),
    ),
  );
  assert.ok(
    mounted.requests.some((request) =>
      request.path.endsWith('/git/files/remove'),
    ),
  );
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

test('renderiza a sincronização em uma única ação entre main e origin/main', async () => {
  const mounted = await mountPanel({
    overview: { ...baseOverview, clean: true, files: [] },
  });
  cleanup = mounted.restore;

  assert.ok(mounted.wrapper.find('.git-sync-card').exists());
  assert.match(mounted.wrapper.text(), /main\s*→\s*origin\/main/);
  assert.match(mounted.wrapper.text(), /Sincronizado/);
  assert.match(
    mounted.wrapper.text(),
    /A sincronização atualiza a main e publica no origin/,
  );
  assert.equal(mounted.wrapper.findAll('.git-sync-button').length, 1);
  assert.doesNotMatch(
    mounted.wrapper.text(),
    /upstream|fetch|pipeline|estratégia|pull request/i,
  );
});

test('sincroniza a main em uma única mutação confirmada', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: { ...baseOverview, clean: true, files: [] },
    handler: (request) => {
      if (request.path.endsWith('/git/sync/main/confirmations')) {
        return jsonResponse({
          confirmation: {
            token: 'p'.repeat(64),
            reference: 'upstream/main',
            strategy: 'merge',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/sync/main')) {
        return jsonResponse({
          result: {
            branch: 'main',
            reference: 'upstream/main',
            strategy: 'merge',
            changed: true,
            previousHead: 'a'.repeat(40),
            currentHead: 'b'.repeat(40),
          },
        });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  await mounted.wrapper.find('.git-sync-button').trigger('click');
  await flushPromises();
  await flushPromises();

  const requestPaths = mounted.requests.map((request) => request.path);
  const confirmationIndex = requestPaths.findIndex((path) =>
    path.endsWith('/git/sync/main/confirmations'),
  );
  const mutationIndex = requestPaths.findIndex((path) =>
    path.endsWith('/git/sync/main')
    && !path.endsWith('/confirmations'),
  );
  assert.ok(confirmationIndex >= 0);
  assert.ok(mutationIndex > confirmationIndex);
  assert.match(
    mounted.wrapper.text(),
    /Main atualizada e publicada em origin\/main/,
  );
});
