import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  GitDiffSnapshot,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import ProjectGitDiffPage from '../src/components/ProjectGitDiffPage.vue';

const jsonHeaders = { 'content-type': 'application/json' };

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'fix/cadastro',
  detached: false,
  ahead: 0,
  behind: 0,
  clean: false,
  files: [],
  recentCommits: [],
};

const snapshot: GitDiffSnapshot = {
  repository: true,
  scope: 'combined',
  files: [
    {
      path: 'src/signup/index.tsx',
      status: 'modified',
      additions: 1,
      deletions: 1,
      binary: false,
    },
    {
      path: 'src/terms.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      binary: false,
    },
  ],
};

const patches: Record<string, string> = {
  'src/signup/index.tsx': [
    '@@ -10,3 +10,3 @@ export function Signup() {',
    ' const form = useForm();',
    '-return <Form title="cadastro" />;',
    '+return <Form title="cadastro novo" />;',
    ' }',
  ].join('\n'),
  'src/terms.ts': [
    '@@ -0,0 +1,2 @@',
    '+export const TERMS = "v2";',
    '+export const ACCEPTED = true;',
  ].join('\n'),
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

/**
 * O realce de sintaxe entra por import dinâmico: além dos microtasks, é preciso
 * esperar o módulo carregar antes de olhar para o conteúdo dos cartões.
 */
async function settle(wrapper: { html: () => string }): Promise<void> {
  await vi.waitFor(
    () => {
      if (wrapper.html().includes('Carregando '))
        throw new Error('diff ainda carregando');
    },
    { timeout: 5_000, interval: 10 },
  );
  await flushPromises();
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

async function mountPage(options: { lines?: string[] } = {}) {
  const originalFetch = globalThis.fetch;
  const requests: RequestRecord[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push({ path: url.pathname, query: url.searchParams });

    if (url.pathname.endsWith('/git/diff/file/lines')) {
      const start = Number(url.searchParams.get('start'));
      const end = Number(url.searchParams.get('end'));
      const lines = options.lines ?? ['contexto acima', 'mais contexto'];
      return jsonResponse({
        lines: {
          path: url.searchParams.get('path'),
          scope: 'combined',
          start,
          end,
          totalLines: 120,
          lines,
          masked: false,
          redactionCount: 0,
        },
      });
    }
    if (url.pathname.endsWith('/git/diff/file')) {
      const filePath = url.searchParams.get('path') ?? '';
      return jsonResponse({
        file: {
          path: filePath,
          scope: 'combined',
          status: 'modified',
          binary: false,
          content: patches[filePath] ?? '',
          truncated: false,
          masked: false,
          redactionCount: 0,
        },
      });
    }
    if (url.pathname.endsWith('/git/diff'))
      return jsonResponse({ diff: snapshot });
    if (url.pathname.endsWith('/git')) return jsonResponse({ git: overview });
    return jsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  const wrapper = mount(ProjectGitDiffPage, {
    props: { projectId: 'projeto-1' },
    attachTo: document.body,
  });

  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  await settle(wrapper);
  return { wrapper, requests };
}

test('empilha um cartão por arquivo alterado', async () => {
  const { wrapper } = await mountPage();

  const cards = wrapper.findAll('.git-diff-file-card');
  assert.equal(cards.length, 2);
  assert.ok(cards[0]?.text().includes('index.tsx'));
  assert.ok(cards[1]?.text().includes('terms.ts'));
});

test('carrega o diff de todos os arquivos sem seleção manual', async () => {
  const { requests } = await mountPage();

  const loaded = requests
    .filter((request) => request.path.endsWith('/git/diff/file'))
    .map((request) => request.query.get('path'));
  assert.deepEqual(loaded.sort(), ['src/signup/index.tsx', 'src/terms.ts']);
});

test('destaca apenas o trecho alterado dentro da linha', async () => {
  const { wrapper } = await mountPage();

  const addition = wrapper.find('.git-diff-unified-row.is-addition');
  assert.ok(addition.exists());
  assert.ok(addition.html().includes('git-diff-word'));
  assert.ok(addition.html().includes('novo'));
});

test('expande o contexto acima do hunk pela seta do cabeçalho', async () => {
  const { wrapper, requests } = await mountPage();

  const card = wrapper.findAll('.git-diff-file-card')[0]!;
  const expandUp = card.findAll('.git-diff-expand')[0]!;
  assert.equal(expandUp.attributes('disabled'), undefined);

  await expandUp.trigger('click');
  await settle(wrapper);

  const lineRequest = requests.find((request) =>
    request.path.endsWith('/git/diff/file/lines'),
  );
  assert.ok(lineRequest, 'esperava uma requisição de linhas');
  assert.equal(lineRequest!.query.get('path'), 'src/signup/index.tsx');
  assert.equal(lineRequest!.query.get('start'), '1');
  assert.equal(lineRequest!.query.get('end'), '9');
  assert.ok(card.text().includes('contexto acima'));
});

test('marcar como revisado recolhe o arquivo e move o progresso', async () => {
  const { wrapper } = await mountPage();

  const card = wrapper.findAll('.git-diff-file-card')[0]!;
  await card.find('.git-diff-viewed input').setValue(true);

  assert.ok(card.classes().includes('is-collapsed'));
  assert.ok(
    wrapper.find('.git-diff-progress').text().includes('1 de 2 revisados'),
  );
});

test('filtra os cartões pela busca de arquivo', async () => {
  const { wrapper } = await mountPage();

  await wrapper.find('.git-diff-file-search input').setValue('terms');
  assert.equal(wrapper.findAll('.git-diff-file-card').length, 1);
  assert.ok(wrapper.text().includes('terms.ts'));
});

test('aplica realce de sintaxe pela extensão do arquivo', async () => {
  const { wrapper } = await mountPage();

  const card = wrapper.findAll('.git-diff-file-card')[1]!;
  assert.ok(card.text().includes('terms.ts'));
  assert.ok(
    card.html().includes('hljs-keyword'),
    'esperava tokens de sintaxe no diff',
  );
});
