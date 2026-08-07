import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import ProjectGitHistoryPage from '../src/components/ProjectGitHistoryPage.vue';

const jsonHeaders = { 'content-type': 'application/json' };

const commits = [
  {
    hash: 'a'.repeat(40),
    shortHash: 'aaaaaaa',
    subject: 'fix: Página de cadastro - Incluir termos de uso',
    authorName: 'Felipe Urgal',
    authorEmail: 'felipe@example.test',
    authoredAt: '2026-07-31T13:48:00.000Z',
    parentCount: 1,
  },
  {
    hash: 'b'.repeat(40),
    shortHash: 'bbbbbbb',
    subject: 'Merge branch main',
    authorName: 'Mariana Souza',
    authorEmail: 'mariana@example.test',
    authoredAt: '2026-07-30T18:33:00.000Z',
    parentCount: 2,
  },
];

const detail = {
  hash: 'a'.repeat(40),
  shortHash: 'aaaaaaa',
  subject: 'fix: Página de cadastro - Incluir termos de uso',
  body: 'Inclui o aceite obrigatório.',
  authorName: 'Felipe Urgal',
  authorEmail: 'felipe@example.test',
  authoredAt: '2026-07-31T13:48:00.000Z',
  files: [
    {
      path: 'app/ui/pages/auth/signup/index.tsx',
      status: 'modified' as const,
      additions: 24,
      deletions: 8,
      binary: false,
    },
  ],
  additions: 24,
  deletions: 8,
  patch: '',
  truncated: false,
  masked: false,
  redactionCount: 0,
};

const fileDiff = {
  hash: 'a'.repeat(40),
  path: 'app/ui/pages/auth/signup/index.tsx',
  status: 'modified' as const,
  binary: false,
  content: [
    '@@ -24,7 +24,8 @@ interface SignupFormStepProps {',
    ' onSubmit: React.ComponentProps<"form">["onSubmit"];',
    '-  acceptedTerms: boolean;',
    '+  acceptedTerms: boolean | null;',
    ' }',
  ].join('\n'),
  truncated: false,
  masked: false,
  redactionCount: 0,
};

interface RequestRecord {
  path: string;
  query: URLSearchParams;
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

/** O modal é teleportado para o body, então olhamos o documento inteiro. */
function documentHtml(): string {
  return document.body.innerHTML;
}

function modalElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.git-history-modal');
}

async function settle(marker = 'Carregando'): Promise<void> {
  await vi.waitFor(
    () => {
      if (documentHtml().includes(marker)) throw new Error('ainda carregando');
    },
    { timeout: 5_000, interval: 10 },
  );
  await flushPromises();
}

async function clickIn(selector: string, text?: string): Promise<void> {
  const candidates = [...document.querySelectorAll<HTMLElement>(selector)];
  const target = text
    ? candidates.find((item) => item.textContent?.includes(text))
    : candidates[0];
  target?.click();
  await flushPromises();
}

async function mountPage(options: { total?: number } = {}) {
  const originalFetch = globalThis.fetch;
  const requests: RequestRecord[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push({ path: url.pathname, query: url.searchParams });

    if (url.pathname.endsWith('/git/workspace')) {
      return jsonResponse({
        workspace: {
          branches: [
            {
              name: 'fix/cadastro',
              shortName: 'fix/cadastro',
              kind: 'local',
              current: true,
              ahead: 0,
              behind: 0,
            },
            {
              name: 'origin/main',
              shortName: 'main',
              kind: 'remote',
              current: false,
              remote: 'origin',
              ahead: 0,
              behind: 0,
            },
          ],
          remotes: [],
        },
      });
    }
    if (
      url.pathname.includes('/git/commits/') &&
      url.pathname.endsWith('/file')
    ) {
      return jsonResponse({ file: fileDiff });
    }
    if (url.pathname.includes('/git/commits/')) {
      return jsonResponse({ detail });
    }
    if (
      url.pathname.endsWith('/git/exclusive-branch-commits') ||
      url.pathname.endsWith('/git/commits')
    ) {
      const total = options.total ?? commits.length;
      return jsonResponse({
        history: {
          branch: 'fix/cadastro',
          page: Number(url.searchParams.get('page') ?? '1'),
          pageSize: 20,
          total,
          totalPages: Math.max(1, Math.ceil(total / 20)),
          commits,
        },
      });
    }
    return jsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  const wrapper = mount(ProjectGitHistoryPage, {
    props: { projectId: 'projeto-1' },
    attachTo: document.body,
  });

  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  await settle('Carregando commits');
  return { wrapper, requests };
}

test('lista commits em tabela agrupada por dia', async () => {
  const { wrapper } = await mountPage();

  const rows = wrapper.findAll('.git-history-row');
  assert.equal(rows.length, 2);
  assert.equal(wrapper.findAll('.git-history-day').length, 2);
  assert.ok(rows[0]?.text().includes('aaaaaaa'));
  assert.ok(rows[0]?.text().includes('Incluir termos de uso'));
  assert.ok(rows[1]?.text().includes('merge'));
});

test('consulta os commits exclusivos da branch por padrão', async () => {
  const { requests } = await mountPage();

  const listed = requests.find((request) =>
    request.path.endsWith('/git/exclusive-branch-commits'),
  );
  assert.ok(listed, 'esperava a consulta de commits exclusivos');
  assert.equal(listed!.query.get('pageSize'), '20');
});

test('abre o commit em modal com os arquivos alterados', async () => {
  const { wrapper } = await mountPage();

  await wrapper.findAll('.git-history-row')[0]!.trigger('click');
  await settle('Carregando detalhes');

  const modal = modalElement();
  assert.ok(modal, 'esperava o modal do commit');
  assert.ok(modal!.textContent?.includes('Arquivos alterados (1)'));
  assert.ok(modal!.textContent?.includes('app/ui/pages/auth/signup/index.tsx'));
  assert.ok(modal!.textContent?.includes('+24'));
});

test('carrega o diff do arquivo com destaque de trecho alterado', async () => {
  const { wrapper, requests } = await mountPage();

  await wrapper.findAll('.git-history-row')[0]!.trigger('click');
  await settle('Carregando detalhes');
  await settle('Carregando diff');

  const fileRequest = requests.find((request) =>
    request.path.endsWith('/file'),
  );
  assert.ok(fileRequest, 'esperava a consulta do diff do arquivo');
  assert.equal(
    fileRequest!.query.get('path'),
    'app/ui/pages/auth/signup/index.tsx',
  );

  assert.ok(
    document.querySelector('.git-diff-unified-row.is-addition'),
    'esperava linhas do diff renderizadas',
  );
  assert.ok(
    documentHtml().includes('git-diff-word'),
    'esperava destaque intralinha',
  );
});

test('alterna entre unificado e lado a lado', async () => {
  const { wrapper } = await mountPage();

  await wrapper.findAll('.git-history-row')[0]!.trigger('click');
  await settle('Carregando detalhes');
  await settle('Carregando diff');

  assert.ok(document.querySelector('.git-diff-unified'));
  await clickIn('.git-diff-view-switch button', 'Lado a lado');

  assert.ok(document.querySelector('.git-diff-split'));
  assert.ok(document.querySelectorAll('.git-diff-side-cell').length > 0);
});

test('fecha o modal pelo botão de fechar', async () => {
  const { wrapper } = await mountPage();

  await wrapper.findAll('.git-history-row')[0]!.trigger('click');
  await settle('Carregando detalhes');

  await clickIn('.git-history-close');
  assert.equal(modalElement(), null);
});

test('mostra a faixa e a paginação do total de commits', async () => {
  const { wrapper, requests } = await mountPage({ total: 32 });

  assert.ok(
    wrapper
      .find('.git-history-pagination')
      .text()
      .includes('Mostrando 1 a 2 de 32 commits'),
  );

  const next = wrapper
    .findAll('.git-history-pagination button')
    .find((button) => button.text() === 'Próxima')!;
  await next.trigger('click');
  await flushPromises();

  const paged = requests.filter((request) => request.query.get('page') === '2');
  assert.equal(paged.length, 1);
});

test('não deixa um workspace atrasado de um projeto anterior sobrescrever o mais recente', async () => {
  const originalFetch = globalThis.fetch;
  function workspaceFor(branchName: string) {
    return {
      workspace: {
        branches: [
          {
            name: branchName,
            shortName: branchName,
            kind: 'local',
            current: true,
            ahead: 0,
            behind: 0,
          },
        ],
        remotes: [],
      },
    };
  }
  let resolveDelayedWorkspaceB: (() => void) | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const projectId = url.pathname.split('/')[3] ?? '';

    if (url.pathname.endsWith('/git/workspace')) {
      if (projectId === 'projeto-b') {
        await new Promise<void>((resolve) => {
          resolveDelayedWorkspaceB = resolve;
        });
      }
      return jsonResponse(workspaceFor(`branch-local-${projectId}`));
    }
    if (
      url.pathname.endsWith('/git/exclusive-branch-commits') ||
      url.pathname.endsWith('/git/commits')
    ) {
      return jsonResponse({
        history: {
          branch: 'main',
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
          commits: [],
        },
      });
    }
    return jsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  const wrapper = mount(ProjectGitHistoryPage, {
    props: { projectId: 'projeto-a' },
    attachTo: document.body,
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await settle('Carregando commits');
  assert.ok(documentHtml().includes('branch-local-projeto-a'));

  await wrapper.setProps({ projectId: 'projeto-b' });
  await flushPromises();
  await wrapper.setProps({ projectId: 'projeto-c' });
  await settle('Carregando commits');
  assert.ok(documentHtml().includes('branch-local-projeto-c'));

  resolveDelayedWorkspaceB?.();
  await flushPromises();
  assert.ok(
    documentHtml().includes('branch-local-projeto-c'),
    'a resposta atrasada de projeto-b não deveria sobrescrever projeto-c',
  );
  assert.ok(!documentHtml().includes('branch-local-projeto-b'));
});
