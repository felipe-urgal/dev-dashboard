import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  composeProjectGitPullRequest: vi.fn(),
  fetchProjectAiStatus: vi.fn(),
  getProjectGitPullRequestStatus: vi.fn(),
  prepareProjectGitPullRequestAction: vi.fn(),
  reviewProjectGitPullRequest: vi.fn(),
  runProjectGitPullRequestAction: vi.fn(),
  streamProjectAiModelPull: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectGitPullRequestPage from '../src/components/ProjectGitPullRequestPage.vue';

const latestCommit = {
  hash: 'a'.repeat(40),
  shortHash: 'aaaaaaa',
  subject: 'feat: abre Pull Request pelo painel',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-07-31T10:00:00.000Z',
};

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'feature/pull-request',
  detached: false,
  upstream: 'origin/feature/pull-request',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  latestCommit,
  recentCommits: [latestCommit],
};

const workspace: ProjectGitWorkspace = {
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:felipe-urgal/dev-dashboard.git',
      pushUrl: 'git@github.com:felipe-urgal/dev-dashboard.git',
      role: 'origin',
    },
    {
      name: 'upstream',
      fetchUrl: 'git@github.com:empresa/dev-dashboard.git',
      pushUrl: 'git@github.com:empresa/dev-dashboard.git',
      role: 'upstream',
    },
  ],
  branches: [
    {
      name: 'feature/pull-request',
      shortName: 'feature/pull-request',
      kind: 'local',
      current: true,
      upstream: 'origin/feature/pull-request',
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
    },
    {
      name: 'origin/develop',
      shortName: 'develop',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'upstream/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'upstream',
      ahead: 0,
      behind: 0,
    },
  ],
};

let popup: {
  opener: Window | null;
  closed: boolean;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.restoreAllMocks();
  api.composeProjectGitPullRequest.mockReset();
  api.fetchProjectAiStatus.mockReset();
  api.getProjectGitPullRequestStatus.mockReset();
  api.prepareProjectGitPullRequestAction.mockReset();
  api.reviewProjectGitPullRequest.mockReset();
  api.runProjectGitPullRequestAction.mockReset();
  api.streamProjectAiModelPull.mockReset();
  api.fetchProjectAiStatus.mockResolvedValue({
    available: true,
    message: '1 modelo instalado no Ollama local.',
    models: [{ name: 'qwen2.5-coder:7b', capabilities: ['chat'] }],
  });
  api.getProjectGitPullRequestStatus.mockResolvedValue({ checked: true });
  api.composeProjectGitPullRequest.mockResolvedValue({
    provider: 'github',
    url: 'https://github.com/empresa/dev-dashboard/compare/main...felipe-urgal:feature/pull-request?expand=1',
    branch: 'feature/pull-request',
    defaultBranch: 'main',
  });
  popup = {
    opener: window,
    closed: false,
    location: { href: 'about:blank' },
    close: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
});

test('revisa o diff da base escolhida sem bloquear a abertura da PR', async () => {
  api.reviewProjectGitPullRequest.mockResolvedValue({
    targetRemote: 'upstream',
    baseBranch: 'main',
    sourceBranch: 'feature/pull-request',
    model: 'qwen2.5-coder:7b',
    reviewedAt: '2026-08-09T12:00:00.000Z',
    summary: 'A mudança precisa validar a entrada antes de salvar.',
    findings: [
      {
        severity: 'warning',
        path: 'src/save.ts',
        line: 18,
        title: 'Entrada não validada',
        explanation: 'O valor segue direto para persistência.',
        recommendation: 'Valide o valor antes de salvar.',
      },
    ],
    diffTruncated: false,
    masked: false,
    redactionCount: 0,
  });
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
      forcePushBranch: null,
    },
  });
  await flushPromises();
  await flushPromises();

  const reviewButton = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Revisar mudanças com IA'));
  assert.ok(reviewButton);
  await reviewButton!.trigger('click');
  await flushPromises();

  assert.deepEqual(api.reviewProjectGitPullRequest.mock.calls, [
    [
      'p1',
      {
        targetRemote: 'upstream',
        baseBranch: 'main',
        model: 'qwen2.5-coder:7b',
      },
    ],
  ]);
  assert.match(wrapper.text(), /Resultado da revisão/);
  assert.match(wrapper.text(), /Entrada não validada/);
  assert.ok(
    wrapper
      .findAll('button')
      .some((button) => button.text().includes('Abrir Pull Request')),
  );
});

test('oferece modelos locais recomendados quando o instalador é aberto', async () => {
  api.fetchProjectAiStatus.mockResolvedValue({
    available: true,
    message: 'Ollama local detectado, mas nenhum modelo está instalado.',
    models: [],
  });
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
      forcePushBranch: null,
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Adicionar modelo local/);
  assert.doesNotMatch(wrapper.text(), /Modelos locais recomendados/);
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Adicionar modelo local')!
    .trigger('click');

  assert.match(wrapper.text(), /Modelos locais recomendados/);
  assert.match(wrapper.text(), /ollama pull qwen2\.5-coder:7b/);
  assert.match(wrapper.text(), /ollama pull qwen2\.5-coder:14b/);
  assert.match(wrapper.text(), /ollama pull devstral:24b/);
});

test('mantém sugestões acessíveis e oculta o modelo que já está instalado', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
      forcePushBranch: null,
    },
  });
  await flushPromises();
  await flushPromises();

  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Adicionar modelo local')!
    .trigger('click');

  assert.match(wrapper.text(), /qwen2\.5-coder:14b/);
  assert.match(wrapper.text(), /devstral:24b/);
  assert.doesNotMatch(wrapper.text(), /ollama pull qwen2\.5-coder:7b/);
});

test('instala um modelo recomendado e atualiza a lista de modelos', async () => {
  api.fetchProjectAiStatus
    .mockResolvedValueOnce({
      available: true,
      message: 'Ollama local detectado, mas nenhum modelo está instalado.',
      models: [],
    })
    .mockResolvedValueOnce({
      available: true,
      message: '1 modelo instalado no Ollama local.',
      models: [{ name: 'qwen2.5-coder:7b', capabilities: ['chat'] }],
    });
  api.streamProjectAiModelPull.mockImplementation(
    (_projectId: string, model: string, onEvent: (event: unknown) => void) => {
      onEvent({
        type: 'progress',
        model,
        status: 'downloading',
        completed: 50,
        total: 100,
      });
      onEvent({ type: 'done', model });
      return { close: vi.fn(), done: Promise.resolve() };
    },
  );
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
      forcePushBranch: null,
    },
  });
  await flushPromises();
  await flushPromises();

  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Adicionar modelo local')!
    .trigger('click');
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Instalar')!
    .trigger('click');
  await flushPromises();
  await flushPromises();

  assert.equal(api.streamProjectAiModelPull.mock.calls.length, 1);
  assert.equal(api.streamProjectAiModelPull.mock.calls[0]?.[0], 'p1');
  assert.equal(
    api.streamProjectAiModelPull.mock.calls[0]?.[1],
    'qwen2.5-coder:7b',
  );
  assert.equal(
    typeof api.streamProjectAiModelPull.mock.calls[0]?.[2],
    'function',
  );
  assert.match(wrapper.text(), /Modelos locais recomendados/);
  assert.doesNotMatch(wrapper.text(), /ollama pull qwen2\.5-coder:7b/);
  assert.match(wrapper.text(), /ollama pull qwen2\.5-coder:14b/);
  assert.match(wrapper.text(), /1 modelo instalado/);
});

test('prefere upstream e preenche título e descrição a partir do commit', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  const selects = wrapper.findAll('select');
  assert.equal((selects[0]!.element as HTMLSelectElement).value, 'upstream');
  assert.equal((selects[1]!.element as HTMLSelectElement).value, 'main');
  assert.equal(
    (wrapper.find('input:not([readonly])').element as HTMLInputElement).value,
    latestCommit.subject,
  );
  assert.match(
    (wrapper.find('textarea').element as HTMLTextAreaElement).value,
    /## Resumo/,
  );
  assert.deepEqual(api.getProjectGitPullRequestStatus.mock.calls.at(-1), [
    'p1',
    { targetRemote: 'upstream', baseBranch: 'main' },
  ]);
});

test('mantém o force push no origin, separado do destino da Pull Request', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
      forcePushBranch: 'feature/pull-request',
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Branch de origem/);
  assert.match(wrapper.text(), /origin\/feature\/pull-request/);
  assert.match(wrapper.text(), /Destino do PR/);
  assert.match(wrapper.text(), /Substituir branch remota/);
  assert.match(wrapper.text(), /origin\/feature\/pull-request.*com lease/s);

  const targetSelect = wrapper.findAll('select')[0]!;
  await targetSelect.setValue('upstream');
  await flushPromises();

  await wrapper
    .findAll('.git-pr-force-push button')
    .find((button) => button.text().includes('Forçar atualização no origin'))!
    .trigger('click');

  assert.deepEqual(wrapper.emitted('force-push'), [[]]);
});

test('reserva a aba no clique e navega sem falso erro nem botão duplicado', async () => {
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  const selects = wrapper.findAll('select');
  await selects[0]!.setValue('origin');
  await flushPromises();
  await selects[1]!.setValue('develop');
  await flushPromises();
  await wrapper
    .find('input:not([readonly])')
    .setValue('fix: título customizado');
  await wrapper
    .find('textarea')
    .setValue('## Mudanças\n\nDescrição customizada.');
  await wrapper.find('form').trigger('submit');
  await flushPromises();

  assert.deepEqual(api.composeProjectGitPullRequest.mock.calls[0], [
    'p1',
    {
      targetRemote: 'origin',
      baseBranch: 'develop',
      title: 'fix: título customizado',
      description: '## Mudanças\n\nDescrição customizada.',
    },
  ]);
  assert.deepEqual((window.open as ReturnType<typeof vi.fn>).mock.calls[0], [
    '',
    '_blank',
  ]);
  assert.equal(popup.opener, null);
  assert.equal(
    popup.location.href,
    'https://github.com/empresa/dev-dashboard/compare/main...felipe-urgal:feature/pull-request?expand=1',
  );
  assert.ok(!wrapper.find('.git-pr-fallback-link').exists());
  assert.doesNotMatch(wrapper.text(), /navegador bloqueou/i);
});

test('troca a ação principal pelo link de continuação quando o popup é bloqueado', async () => {
  (window.open as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  await wrapper.find('form').trigger('submit');
  await flushPromises();

  assert.match(wrapper.text(), /navegador bloqueou a nova aba/i);
  assert.ok(wrapper.find('.git-pr-fallback-link').exists());
  assert.ok(!wrapper.find('.git-pr-footer button').exists());
});

test('detecta PR aberta e substitui a criação por acesso ao PR existente', async () => {
  api.getProjectGitPullRequestStatus.mockResolvedValue({
    checked: true,
    existing: {
      provider: 'github',
      number: 42,
      title: 'feat: PR já existente',
      url: 'https://github.com/empresa/dev-dashboard/pull/42',
      sourceBranch: 'feature/pull-request',
      baseBranch: 'main',
    },
  });

  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /PR #42 já está aberta/);
  assert.match(wrapper.text(), /feat: PR já existente/);
  assert.match(wrapper.text(), /feature\/pull-request → upstream\/main/);
  const existingLink = wrapper.find('.git-pr-existing-action');
  assert.ok(existingLink.exists());
  assert.equal(
    existingLink.attributes('href'),
    'https://github.com/empresa/dev-dashboard/pull/42',
  );
  assert.equal(wrapper.findAll('.git-pr-existing-action').length, 1);

  await wrapper.find('form').trigger('submit');
  await flushPromises();
  assert.equal(api.composeProjectGitPullRequest.mock.calls.length, 0);
});

test('refaz a verificação ao trocar o destino e libera criação quando não há PR', async () => {
  api.getProjectGitPullRequestStatus.mockImplementation(
    async (
      _projectId: string,
      input: { targetRemote: string; baseBranch: string },
    ) => {
      if (input.targetRemote === 'upstream') {
        return {
          checked: true,
          existing: {
            provider: 'github',
            number: 42,
            title: 'feat: PR já existente',
            url: 'https://github.com/empresa/dev-dashboard/pull/42',
            sourceBranch: 'feature/pull-request',
            baseBranch: 'main',
          },
        };
      }
      return { checked: true };
    },
  );

  const wrapper = mount(ProjectGitPullRequestPage, {
    props: {
      projectId: 'p1',
      overview,
      workspace,
      busy: false,
    },
  });
  await flushPromises();
  await flushPromises();
  assert.ok(wrapper.find('.git-pr-existing-action').exists());

  const targetSelect = wrapper.findAll('select')[0]!;
  await targetSelect.setValue('origin');
  await flushPromises();
  await flushPromises();

  assert.ok(!wrapper.find('.git-pr-existing-action').exists());
  assert.deepEqual(api.getProjectGitPullRequestStatus.mock.calls.at(-1), [
    'p1',
    { targetRemote: 'origin', baseBranch: 'main' },
  ]);
  assert.equal(
    (wrapper.find('.git-pr-footer button').element as HTMLButtonElement)
      .disabled,
    false,
  );
});

test('cria a Pull Request via gh após confirmar o comando exibido', async () => {
  api.prepareProjectGitPullRequestAction.mockResolvedValue({
    token: 't'.repeat(64),
    actionId: 'pull-request-create',
    expiresAt: '2026-08-06T00:01:00.000Z',
  });
  api.runProjectGitPullRequestAction.mockResolvedValue({
    action: 'pull-request-create',
    number: 7,
    url: 'https://github.com/empresa/dev-dashboard/pull/7',
    title: latestCommit.subject,
    state: 'open',
  });

  const wrapper = mount(ProjectGitPullRequestPage, {
    props: { projectId: 'p1', overview, workspace, busy: false },
  });
  await flushPromises();
  await flushPromises();

  const createButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Criar direto com gh')!;
  await createButton.trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /gh pr create/);
  const confirmButton = wrapper
    .findAll('.git-pr-confirm button')
    .find((button) => button.text() === 'Confirmar criação')!;
  await confirmButton.trigger('click');
  await flushPromises();

  assert.equal(
    api.prepareProjectGitPullRequestAction.mock.calls[0]?.[1],
    'pull-request-create',
  );
  assert.equal(
    api.runProjectGitPullRequestAction.mock.calls[0]?.[3],
    't'.repeat(64),
  );
});

test('fecha uma PR existente somente após digitar o número correto', async () => {
  api.getProjectGitPullRequestStatus.mockResolvedValue({
    checked: true,
    existing: {
      provider: 'github',
      number: 42,
      title: 'feat: PR já existente',
      url: 'https://github.com/empresa/dev-dashboard/pull/42',
      sourceBranch: 'feature/pull-request',
      baseBranch: 'main',
    },
  });
  api.prepareProjectGitPullRequestAction.mockResolvedValue({
    token: 'c'.repeat(64),
    actionId: 'pull-request-close',
    expiresAt: '2026-08-06T00:01:00.000Z',
  });
  api.runProjectGitPullRequestAction.mockResolvedValue({
    action: 'pull-request-close',
    number: 42,
    url: 'https://github.com/empresa/dev-dashboard/pull/42',
    title: 'feat: PR já existente',
    state: 'closed',
  });

  const wrapper = mount(ProjectGitPullRequestPage, {
    props: { projectId: 'p1', overview, workspace, busy: false },
  });
  await flushPromises();
  await flushPromises();

  await wrapper.find('.git-pr-gh-actions .danger-button').trigger('click');
  await flushPromises();

  const confirmCloseButton = () =>
    wrapper
      .findAll('.git-pr-confirm button')
      .find((button) => button.text().includes('Confirmar fechamento'))!;

  assert.equal(
    (confirmCloseButton().element as HTMLButtonElement).disabled,
    true,
  );

  const input = wrapper.find('.git-pr-confirm input');
  await input.setValue('42');
  await flushPromises();

  assert.equal(
    (confirmCloseButton().element as HTMLButtonElement).disabled,
    false,
  );
  await confirmCloseButton().trigger('click');
  await flushPromises();

  assert.equal(
    api.prepareProjectGitPullRequestAction.mock.calls[0]?.[1],
    'pull-request-close',
  );
  assert.deepEqual(api.prepareProjectGitPullRequestAction.mock.calls[0]?.[2], {
    number: 42,
  });
});
