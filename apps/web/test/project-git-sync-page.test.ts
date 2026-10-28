import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type {
  GitBranch,
  GitCommit,
  GitSyncProgressEvent,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitSyncPage from '../src/components/ProjectGitSyncPage.vue';

const commit = (hash: string): GitCommit => ({
  hash,
  shortHash: hash.slice(0, 7),
  subject: `commit ${hash}`,
  authorName: 'Dev',
  authorEmail: 'dev@example.test',
  authoredAt: '2026-09-10T12:00:00.000Z',
});

function branch(overrides: Partial<GitBranch>): GitBranch {
  return {
    name: 'main',
    shortName: 'main',
    kind: 'local',
    current: true,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

/** Workspace com main local, origin e (opcionalmente) upstream. */
function workspaceOf(options: {
  localHash?: string;
  originHash?: string;
  upstream?: boolean;
  upstreamHash?: string;
  extra?: GitBranch[];
  localBehind?: number;
}): ProjectGitWorkspace {
  const localHash = options.localHash ?? 'aaaaaaa1';
  const remote = (name: string, hash: string): GitBranch =>
    branch({
      name: `${name}/main`,
      kind: 'remote',
      current: false,
      remote: name,
      latestCommit: commit(hash),
    });

  return {
    branches: [
      branch({
        upstream: 'origin/main',
        behind: options.localBehind ?? 0,
        latestCommit: commit(localHash),
        current: !options.extra?.some((item) => item.current),
      }),
      remote('origin', options.originHash ?? localHash),
      ...(options.upstream
        ? [remote('upstream', options.upstreamHash ?? localHash)]
        : []),
      ...(options.extra ?? []),
    ],
    remotes: [
      { name: 'origin', fetchUrl: 'a', pushUrl: 'a', role: 'origin' },
      ...(options.upstream
        ? [
            {
              name: 'upstream',
              fetchUrl: 'b',
              pushUrl: 'b',
              role: 'upstream' as const,
            },
          ]
        : []),
    ],
  };
}

const overview = (overrides: Partial<ProjectGitOverview> = {}) =>
  ({
    repository: true,
    branch: 'main',
    detached: false,
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
    ...overrides,
  }) as ProjectGitOverview;

function mountPage(props: Record<string, unknown>) {
  return mount(ProjectGitSyncPage, {
    props: { busy: false, checking: false, ...props } as never,
  });
}

const syncButton = (wrapper: ReturnType<typeof mountPage>) =>
  wrapper
    .find('.git-flow-summary')
    .findAll('button')
    .find((button) => button.text().includes('Sincroniz'))!;

describe('ProjectGitSyncPage', () => {
  it('em dia: não oferece sincronizar e mostra o fluxo com upstream só se existir', () => {
    const fork = mountPage({
      overview: overview(),
      workspace: workspaceOf({ upstream: true }),
    });
    expect(fork.text()).toContain('Tudo em dia');
    expect(fork.text()).toContain('upstream/main');
    expect(syncButton(fork).attributes('disabled')).toBeDefined();

    const originOnly = mountPage({
      overview: overview(),
      workspace: workspaceOf({}),
    });
    expect(originOnly.text()).toContain('Tudo em dia');
    expect(originOnly.text()).not.toContain('upstream/main');
  });

  it('desatualizada: descreve a diferença e sincroniza pelo botão', async () => {
    const wrapper = mountPage({
      overview: overview(),
      workspace: workspaceOf({ originHash: 'bbbbbbb2', localBehind: 3 }),
    });

    expect(wrapper.text()).toContain(
      'main está 3 commits atrás de origin/main',
    );
    expect(syncButton(wrapper).attributes('disabled')).toBeUndefined();

    await syncButton(wrapper).trigger('click');
    expect(wrapper.emitted('synchronize')).toHaveLength(1);
  });

  it('com alterações locais bloqueia a sincronização e leva para o Commit', async () => {
    const wrapper = mountPage({
      overview: overview({
        clean: false,
        files: [
          { path: 'a.rb', status: 'modified' },
          { path: 'b.rb', status: 'modified' },
        ] as never,
      }),
      workspace: workspaceOf({ originHash: 'bbbbbbb2', localBehind: 1 }),
    });

    expect(wrapper.text()).toContain('2 arquivos alterados');
    expect(syncButton(wrapper).attributes('disabled')).toBeDefined();

    const toCommit = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ir para Commit')!;
    await toCommit.trigger('click');
    expect(wrapper.emitted('open-commit')).toHaveLength(1);
  });

  it('não afirma que está tudo em dia quando a verificação remota falha', () => {
    const wrapper = mountPage({
      overview: overview(),
      workspace: workspaceOf({}),
      verificationError: 'Falha ao verificar referências.',
    });

    expect(wrapper.text()).toContain('Verificação incompleta');
    expect(wrapper.text()).not.toContain('Tudo em dia');
    expect(syncButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('durante a verificação remota o botão fica desabilitado sem girar', () => {
    const wrapper = mountPage({
      overview: overview(),
      workspace: workspaceOf({}),
      checking: true,
    });

    expect(wrapper.text()).toContain('Verificando');
    expect(syncButton(wrapper).attributes('disabled')).toBeDefined();
    expect(syncButton(wrapper).attributes('aria-busy')).toBeUndefined();
  });

  describe('branch em uso', () => {
    const feature = (behind: number, ahead = 0): GitBranch =>
      branch({
        name: 'feature/x',
        shortName: 'feature/x',
        upstream: 'origin/feature/x',
        behind,
        ahead,
        latestCommit: commit('ccccccc3'),
      });

    const featureOverview = (behind: number, ahead = 0) =>
      overview({
        branch: 'feature/x',
        upstream: 'origin/feature/x',
        behind,
        ahead,
      });

    it('atrasada: oferece atualizar e emite o evento', async () => {
      const wrapper = mountPage({
        overview: featureOverview(2),
        workspace: workspaceOf({ extra: [feature(2)] }),
      });

      const card = wrapper.find('.git-current');
      expect(card.text()).toContain('feature/x');
      expect(card.text()).toContain('origin/feature/x');
      expect(card.text()).toContain('2 commits novos no remoto');

      await card
        .findAll('button')
        .find((button) => button.text() === 'Atualizar local')!
        .trigger('click');
      expect(wrapper.emitted('update-current-branch')).toHaveLength(1);
    });

    it('divergente: avisa e ainda permite a atualização segura', () => {
      const wrapper = mountPage({
        overview: featureOverview(2, 1),
        workspace: workspaceOf({ extra: [feature(2, 1)] }),
      });

      expect(wrapper.find('.git-current').text()).toContain(
        'Commits locais e remotos pendentes',
      );
    });

    it('atualizando a branch não bloqueia o botão de rótulo da main como ocupado', () => {
      const wrapper = mountPage({
        overview: featureOverview(1),
        workspace: workspaceOf({ extra: [feature(1)] }),
        busy: true,
        operation: 'current-branch',
      });

      expect(wrapper.find('.git-current').text()).toContain('Atualizando');
      expect(syncButton(wrapper).text()).not.toContain('Sincronizando');
    });
  });

  it('mostra os passos reais da execução, com o comando sob demanda', async () => {
    const event = (
      stepId: string,
      status: GitSyncProgressEvent['status'],
      second: number,
      command?: string,
    ): GitSyncProgressEvent => ({
      runId: 'run-1',
      operation: 'main',
      stepId,
      status,
      message: `mensagem ${stepId}`,
      occurredAt: `2026-09-10T12:34:0${second}.000Z`,
      ...(command ? { command } : {}),
    });

    const wrapper = mountPage({
      overview: overview(),
      workspace: workspaceOf({ originHash: 'bbbbbbb2', localBehind: 1 }),
      busy: true,
      operation: 'main',
      progressEvents: [
        event('fetch-origin', 'running', 1, 'git fetch --prune origin'),
        event('fetch-origin', 'success', 2, 'git fetch --prune origin'),
        event('merge-main', 'running', 2, 'git merge --no-edit origin/main'),
      ],
    });

    expect(wrapper.find('.git-timeline').text()).toContain('Buscar origin');
    expect(wrapper.find('.git-timeline').text()).toContain('Integrar na main');
    expect(wrapper.text()).not.toContain('git fetch --prune origin');

    await wrapper.find('.git-timeline-toggle').trigger('click');
    expect(wrapper.text()).toContain('$ git fetch --prune origin');
  });

  it('conclusão e falha aparecem como resultado da atividade', () => {
    const done = mountPage({
      overview: overview(),
      workspace: workspaceOf({}),
      synchronizationMessage: 'main atualizada a partir de origin/main.',
    });
    expect(done.find('.git-timeline-result').text()).toContain(
      'main atualizada a partir de origin/main.',
    );

    const failed = mountPage({
      overview: overview(),
      workspace: workspaceOf({}),
      synchronizationError: 'Conflito ao integrar a main.',
    });
    expect(failed.find('.git-timeline-result').text()).toContain(
      'Conflito ao integrar a main.',
    );
  });
});
