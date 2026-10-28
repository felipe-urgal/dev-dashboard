import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';
import { NDropdown } from 'naive-ui';

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

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const request: RequestRecord = {
      path: url.pathname,
      method: init?.method ?? 'GET',
      ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
    };
    requests.push(request);

    const handled = await args.handler?.(request);
    if (handled) return handled;

    if (url.pathname.endsWith('/git/workspace')) {
      return jsonResponse({ workspace });
    }
    const remoteFetchMatch = url.pathname.match(
      /\/git\/remotes\/([^/]+)\/fetch$/,
    );
    if (remoteFetchMatch) {
      return jsonResponse({
        remote: decodeURIComponent(remoteFetchMatch[1] ?? ''),
      });
    }
    if (url.pathname.endsWith('/git/diff/file')) {
      const filePath = url.searchParams.get('path') ?? '';
      const file =
        args.fileDiff?.(filePath) ??
        ({
          path: filePath,
          scope: 'combined',
          status: 'modified',
          binary: false,
          content: '-const value = 1;\n+const value = 42;\n',
          truncated: false,
          masked: false,
          redactionCount: 0,
        } satisfies GitFileDiff);
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

test('abre diretamente na aba Sincronização', async () => {
  const mounted = await mountPanel();
  cleanup = mounted.restore;

  assert.match(mounted.wrapper.text(), /Sincronizar/);
  assert.ok(
    mounted.wrapper
      .findAll('.git-subtabs button')
      .find((button) => button.text() === 'Sincronização')
      ?.classes('active'),
  );
});

test('atualiza a branch atual a partir do upstream por pull confirmado', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const collaborativeOverview: ProjectGitOverview = {
    ...baseOverview,
    behind: 2,
    ahead: 0,
    clean: true,
  };
  const collaborativeWorkspace: ProjectGitWorkspace = {
    ...baseWorkspace,
    branches: baseWorkspace.branches.map((branch) =>
      branch.name === 'feature/git-ui'
        ? { ...branch, behind: 2, ahead: 0 }
        : branch,
    ),
  };

  const mounted = await mountPanel({
    overview: collaborativeOverview,
    workspace: collaborativeWorkspace,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        return jsonResponse(
          {
            confirmation: {
              token: 'p'.repeat(64),
              operation: 'pull',
              target: 'feature/git-ui',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
      }
      if (request.path.endsWith('/git/pull')) {
        return jsonResponse({ branch: { branch: 'feature/git-ui' } });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  const card = mounted.wrapper.find('.git-current');
  assert.ok(card.exists());
  const update = card
    .findAll('button')
    .find((button) => button.text().includes('Atualizar local'));
  assert.ok(update);
  await update.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = mounted.requests.find(
    (request) =>
      request.path.endsWith('/git/mutations/confirmations') &&
      (request.body as { operation?: string } | undefined)?.operation ===
        'pull',
  );
  const pull = mounted.requests.find((request) =>
    request.path.endsWith('/git/pull'),
  );
  assert.deepEqual(confirmation?.body, {
    operation: 'pull',
    target: 'feature/git-ui',
  });
  assert.deepEqual(pull?.body, {
    confirmationToken: 'p'.repeat(64),
  });
  assert.match(
    mounted.wrapper.text(),
    /Branch "feature\/git-ui" atualizada a partir de origin\/feature\/git-ui/,
  );
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

  assert.match(mounted.wrapper.text(), /release\/2.0/);
  assert.doesNotMatch(mounted.wrapper.text(), /upstream\/release\/2.0/);

  const rows = mounted.wrapper.findAll('[data-branch]');
  assert.equal(rows.length, 3);
  const release = rows.find((row) => row.text().includes('release/2.0'));
  assert.ok(release);
  assert.match(release.text(), /Somente remota/);
});

test('cria branch com prefixo pelo modal centralizado', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse(
          {
            confirmation: {
              token: 't'.repeat(64),
              operation: body.operation,
              target: body.target,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
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
  await mounted.wrapper
    .findAll('button')
    .find((button) => button.text() === 'Nova branch')!
    .trigger('click');
  const createForm = mounted.wrapper.find('.git-branch-dialog');
  assert.ok(createForm.exists());
  assert.match(createForm.text(), /Nova branch/);
  await createForm
    .findAll('.git-branch-chips button')
    .find((button) => button.text() === 'bugfix/')!
    .trigger('click');
  await createForm.find('input[aria-label="Nome"]').setValue('correcao-botao');
  await flushPromises();
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
    (mounted.requests[mutationIndex]!.body as { confirmationToken: string })
      .confirmationToken,
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
        return jsonResponse(
          {
            confirmation: {
              token: 'n'.repeat(64),
              operation: 'rename-branch',
              ...body,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
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
    .findAll('[data-branch]')
    .find((row) => row.text().includes('feature/git-ui'));
  assert.ok(currentRow);
  currentRow.findComponent(NDropdown).vm.$emit('select', 'rename');
  await flushPromises();

  const renameForm = mounted.wrapper.find('.git-branch-dialog');
  await renameForm.find('input').setValue('feature/git-ui-renamed');
  await renameForm.trigger('submit');
  await flushPromises();
  await flushPromises();

  const mutation = mounted.requests.find(
    (request) =>
      request.path.endsWith('/git/branches/rename') &&
      !request.path.endsWith('/confirmations'),
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
        return jsonResponse(
          {
            confirmation: {
              token: 'd'.repeat(64),
              operation: 'delete-branch',
              target: 'bugfix/old',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
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
    .findAll('[data-branch]')
    .find((candidate) => candidate.text().includes('bugfix/old'));
  assert.ok(row);
  row.findComponent(NDropdown).vm.$emit('select', 'delete');
  await flushPromises();

  const deleteForm = mounted.wrapper.find('.git-branch-dialog');
  const submit = deleteForm.find('button[type="submit"]');
  assert.ok(submit.attributes('disabled') !== undefined);
  await deleteForm.find('input').setValue('bugfix/old');
  await flushPromises();
  assert.equal(
    (
      mounted.wrapper.find('.git-branch-dialog button[type="submit"]')
        .element as HTMLButtonElement
    ).disabled,
    false,
  );
  await mounted.wrapper.find('.git-branch-dialog').trigger('submit');
  await flushPromises();
  await flushPromises();

  const mutation = mounted.requests.find(
    (request) =>
      request.path.endsWith('/git/branches/delete') &&
      !request.path.endsWith('/confirmations'),
  );
  assert.deepEqual(mutation?.body, {
    branch: 'bugfix/old',
    confirmationToken: 'd'.repeat(64),
  });
  assert.match(mounted.wrapper.text(), /Branch "bugfix\/old" removida/);
});

test('cria commit incluindo automaticamente alterações rastreadas', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: commitOverview,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse(
          {
            confirmation: {
              token: 'c'.repeat(64),
              operation: body.operation,
              target: body.target,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
      }
      if (request.path.endsWith('/git/commit')) {
        return jsonResponse(
          {
            commit: {
              hash: '1'.repeat(40),
              shortHash: '1111111',
              subject: 'simplifica commit',
            },
          },
          201,
        );
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  await clickTab(mounted.wrapper, 'Commit');
  await mounted.wrapper
    .find('input[aria-label="Mensagem do commit"]')
    .setValue('simplifica commit');
  await mounted.wrapper.find('.git-commit-submit').trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = mounted.requests.find((request) =>
    request.path.endsWith('/git/mutations/confirmations'),
  );
  const commit = mounted.requests.find((request) =>
    request.path.endsWith('/git/commit'),
  );
  assert.deepEqual(confirmation?.body, {
    operation: 'commit',
    target: 'main',
  });
  assert.deepEqual(commit?.body, {
    message: 'simplifica commit',
    includeAllChanges: false,
    confirmationToken: 'c'.repeat(64),
  });
  assert.match(mounted.wrapper.text(), /Commit "1111111" criado/);
});

test('altera o último commit pelo modo amend', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: commitOverview,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse(
          {
            confirmation: {
              token: 'a'.repeat(64),
              operation: body.operation,
              target: body.target,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
      }
      if (request.path.endsWith('/git/commit/amend')) {
        return jsonResponse(
          {
            commit: {
              hash: '2'.repeat(40),
              shortHash: '2222222',
              subject: 'mensagem corrigida',
            },
          },
          201,
        );
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  await clickTab(mounted.wrapper, 'Commit');
  await mounted.wrapper
    .find('input[aria-label="Mensagem do commit"]')
    .setValue('mensagem corrigida');
  const amendButton = mounted.wrapper.find('.git-commit-amend');
  assert.ok(amendButton.exists());
  await amendButton.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = mounted.requests.find((request) =>
    request.path.endsWith('/git/mutations/confirmations'),
  );
  const amend = mounted.requests.find((request) =>
    request.path.endsWith('/git/commit/amend'),
  );
  assert.deepEqual(confirmation?.body, {
    operation: 'amend',
    target: 'main',
  });
  assert.deepEqual(amend?.body, {
    message: 'mensagem corrigida',
    confirmationToken: 'a'.repeat(64),
  });
  assert.match(mounted.wrapper.text(), /Commit "2222222" alterado/);
});

test('oferece reenvio com lease na Pull Request depois de alterar commit em branch publicada', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: baseOverview,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse(
          {
            confirmation: {
              token: 'a'.repeat(64),
              operation: body.operation,
              target: body.target,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
      }
      if (request.path.endsWith('/git/commit/amend')) {
        return jsonResponse(
          {
            commit: {
              hash: '3'.repeat(40),
              shortHash: '3333333',
              subject: 'commit reescrito',
            },
          },
          201,
        );
      }
      if (
        request.path.endsWith(
          '/git/branches/force-push-with-lease/confirmations',
        )
      ) {
        return jsonResponse(
          {
            confirmation: {
              token: 'l'.repeat(64),
              operation: 'push',
              target: `feature/git-ui::${'1'.repeat(40)}`,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
      }
      if (request.path.endsWith('/git/branches/force-push-with-lease')) {
        return jsonResponse({ branch: { branch: 'feature/git-ui' } });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  await clickTab(mounted.wrapper, 'Commit');
  await mounted.wrapper
    .find('input[aria-label="Mensagem do commit"]')
    .setValue('commit reescrito');
  const amendButton = mounted.wrapper.find('.git-commit-amend');
  assert.ok(amendButton.exists());
  await amendButton.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.equal(mounted.wrapper.text().includes('Reenviar com lease'), false);
  await clickTab(mounted.wrapper, 'Pull Request');
  await flushPromises();
  await flushPromises();

  assert.match(mounted.wrapper.text(), /Push forçado detectado/);
  const forceButton = mounted.wrapper
    .findAll('.git-pr-force-push button')
    .find((button) => button.text().includes('Forçar atualização no origin'));
  assert.ok(forceButton);
  assert.equal((forceButton!.element as HTMLButtonElement).disabled, true);
  await mounted.wrapper.find('.git-pr-force-push-confirm input').setValue(true);
  await forceButton.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = mounted.requests.find((request) =>
    request.path.endsWith('/git/branches/force-push-with-lease/confirmations'),
  );
  const forcePush = mounted.requests.find(
    (request) =>
      request.path.endsWith('/git/branches/force-push-with-lease') &&
      !request.path.endsWith('/confirmations'),
  );
  assert.deepEqual(confirmation?.body, { branch: 'feature/git-ui' });
  assert.deepEqual(forcePush?.body, {
    branch: 'feature/git-ui',
    confirmationToken: 'l'.repeat(64),
  });
  assert.match(
    mounted.wrapper.text(),
    /atualizada em origin\/feature\/git-ui com lease/,
  );
  assert.equal(mounted.wrapper.find('.git-pr-force-push').exists(), false);
});

test('abre a aba Diff como o componente dedicado, sem app aninhado', async () => {
  const mounted = await mountPanel();
  cleanup = mounted.restore;
  await clickTab(mounted.wrapper, 'Diff');

  assert.ok(mounted.wrapper.find('.git-diff-page').exists());
  assert.equal(mounted.wrapper.findAll('.git-tab-page').length, 0);
});

test('avisa sobre alterações locais somente quando há sincronização pendente', async () => {
  const mounted = await mountPanel();
  cleanup = mounted.restore;

  assert.match(mounted.wrapper.text(), /alterações locais pendentes/i);
  assert.doesNotMatch(mounted.wrapper.text(), /Tudo em dia/);
  assert.ok(
    mounted.wrapper
      .find('.git-flow-summary')
      .findAll('button')
      .find((button) => button.text().includes('Sincronizar'))
      ?.attributes('disabled') !== undefined,
  );
});

test('sincroniza a main em uma única mutação confirmada', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: { ...baseOverview, clean: true, files: [] },
    handler: (request) => {
      if (request.path.endsWith('/git/sync/main/confirmations')) {
        return jsonResponse(
          {
            confirmation: {
              token: 'p'.repeat(64),
              reference: 'upstream/main',
              strategy: 'merge',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
          201,
        );
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
            impact: {
              changedPaths: ['src/example.test.ts'],
              actions: [
                {
                  category: 'tests',
                  label: 'Executar testes',
                  description:
                    'Arquivos de teste mudaram; execute os testes relacionados quando desejar.',
                },
              ],
            },
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

  await mounted.wrapper
    .find('.git-flow-summary')
    .findAll('button')
    .find((button) => button.text().includes('Sincronizar'))!
    .trigger('click');
  await flushPromises();
  await flushPromises();

  const requestPaths = mounted.requests.map((request) => request.path);
  const confirmationIndex = requestPaths.findIndex((path) =>
    path.endsWith('/git/sync/main/confirmations'),
  );
  const mutationIndex = requestPaths.findIndex(
    (path) =>
      path.endsWith('/git/sync/main') && !path.endsWith('/confirmations'),
  );
  assert.ok(confirmationIndex >= 0);
  assert.ok(mutationIndex > confirmationIndex);
  assert.match(
    mounted.wrapper.text(),
    /Main atualizada e publicada em origin\/main/,
  );
  assert.equal(mounted.wrapper.find('.git-change-impact').exists(), false);
  assert.doesNotMatch(
    mounted.wrapper.text(),
    /A mudança trouxe|Executar testes/,
  );
});
