import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../src/components/ProjectGitPanel.vue';
import ProjectServerPanel from '../src/components/ProjectServerPanel.vue';
import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { createTestRouter } from './support/test-router';

const fetchProjectProcess = vi.fn().mockResolvedValue(null);
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  fetchProjectProcess: (...args: unknown[]) => fetchProjectProcess(...args),
  fetchProjectProcessLog: vi.fn().mockResolvedValue({
    projectId: 'projeto-card',
    processId: 'proc-1',
    content: '',
    sizeBytes: 0,
    truncated: false,
    masked: false,
    redactionCount: 0,
    readAt: new Date(0).toISOString(),
  }),
  followProjectProcessLogEvents: vi
    .fn()
    .mockReturnValue({ close: vi.fn(), done: new Promise(() => {}) }),
  clearProjectProcessLog: vi.fn().mockResolvedValue({
    projectId: 'projeto-card',
    processId: 'proc-1',
    content: '',
    sizeBytes: 0,
    truncated: false,
    masked: false,
    redactionCount: 0,
    readAt: new Date(0).toISOString(),
  }),
  fetchProjectServerSettings: vi.fn().mockResolvedValue({}),
  fetchProjectTests: vi
    .fn()
    .mockResolvedValue({ supported: false, commands: [] }),
  fetchProjectTestProcess: vi.fn().mockResolvedValue(null),
  fetchProjectTestLog: vi
    .fn()
    .mockResolvedValue({ content: '', truncated: false }),
  fetchProjectGit: vi.fn().mockResolvedValue({
    repository: false,
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
  }),
  fetchProjectGitDiff: vi.fn().mockResolvedValue({
    repository: false,
    scope: 'combined',
    files: [],
  }),
  fetchProjectDatabase: vi.fn().mockResolvedValue({
    supported: false,
    environments: [],
    total: 0,
    page: 1,
    pageSize: 20,
  }),
  fetchProjectScripts: vi
    .fn()
    .mockResolvedValue({ items: [], page: 1, totalPages: 1, total: 0 }),
  fetchScriptExecutionHistory: vi.fn().mockResolvedValue({ items: [] }),
  fetchLatestScriptExecution: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/api/git-workspace', () => ({
  fetchProjectGitWorkspace: vi.fn().mockResolvedValue({
    branches: [],
    remotes: [],
  }),
  fetchProjectGitRemote: vi.fn().mockResolvedValue('origin'),
}));

const publishTerminalNotice = vi.fn();

vi.mock('../src/stores/notice-center', () => ({
  noticeCenterStore: {
    publishTerminalNotice: (...args: unknown[]) =>
      publishTerminalNotice(...args),
  },
}));

const project: Project = {
  id: 'projeto-card',
  workspaceId: 'workspace-card',
  name: 'Projeto Card',
  path: '/tmp/projeto-card',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server', 'tests', 'scripts'],
};

const routerLinkStub = {
  props: ['to'],
  template: '<a><slot /></a>',
};

function mountServerPanel() {
  return mount(ProjectServerPanel, {
    props: { project },
    global: {
      stubs: {
        RouterLink: routerLinkStub,
      },
    },
  });
}

describe('cards dos painéis de detalhe', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('exibe somente a configuração quando o servidor está parado', async () => {
    fetchProjectProcess.mockResolvedValueOnce(null);

    const wrapper = mountServerPanel();
    await flushPromises();

    expect(wrapper.find('.server-dashboard').exists()).toBe(true);
    expect(wrapper.find('.server-config-card').exists()).toBe(true);
    expect(wrapper.find('.server-running-card').exists()).toBe(false);
    expect(wrapper.find('.server-logs').exists()).toBe(false);
    expect(wrapper.text()).toContain('Iniciar servidor');
    expect(wrapper.text()).not.toContain('Atividade recente');
    expect(wrapper.text()).not.toContain('Health check');

    wrapper.unmount();
  });

  it('exibe configuração e informações operacionais quando o servidor está rodando', async () => {
    fetchProjectProcess.mockResolvedValueOnce({
      id: 'proc-running',
      projectId: project.id,
      kind: 'server',
      status: 'running',
      port: 3_000,
      host: '192.168.1.10',
      url: 'http://localhost:3000',
    });

    const wrapper = mountServerPanel();
    await flushPromises();

    expect(wrapper.find('.server-config-card').exists()).toBe(true);
    expect(wrapper.find('.server-running-card').exists()).toBe(true);
    expect(wrapper.find('.server-logs').exists()).toBe(false);
    expect(wrapper.find('.project-log-terminal').exists()).toBe(false);
    expect(wrapper.find('.server-log-button').exists()).toBe(true);
    expect(wrapper.text()).toContain('http://localhost:3000');
    expect(wrapper.text()).toContain('http://192.168.1.10:3000');
    expect(wrapper.text()).not.toContain('Configuração do processo');
    expect(wrapper.text()).not.toContain('Abrir no navegador do sistema');
    expect(wrapper.text()).not.toContain('Health check');

    wrapper.unmount();
  });

  it('renderiza o painel Git com sua navegação própria', async () => {
    const wrapper = mount(ProjectGitPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.find('.git-modern-panel').exists()).toBe(true);
    expect(wrapper.find('.git-subtabs').exists()).toBe(true);
    expect(
      wrapper.findAll('.git-subtabs button').map((button) => button.text()),
    ).toEqual([
      'Sincronização',
      'Branches',
      'Diff',
      'Commit',
      'Desfazer',
      'Pull Request',
      'Histórico',
    ]);
    expect(wrapper.find('.git-subtabs').text()).not.toContain('Resumo');
    expect(wrapper.find('.git-subtabs button')?.text()).toContain(
      'Sincronização',
    );

    wrapper.unmount();
  });

  it('renderiza o painel de testes dentro de Card', async () => {
    const wrapper = mount(ProjectTestsPanel, {
      props: { project },
      global: { plugins: [createTestRouter()] },
    });
    await flushPromises();

    expect(wrapper.get('.dd-card').classes()).toContain('project-detail-card');
    expect(wrapper.find('.dd-card-header').exists()).toBe(true);

    wrapper.unmount();
  });

  it('renderiza banco de dados somente com ambientes', async () => {
    const wrapper = mount(ProjectDatabasePanel, { props: { project } });
    await flushPromises();

    expect(wrapper.find('.database-explorer').exists()).toBe(true);
    expect(wrapper.find('.database-environments-layout').exists()).toBe(true);
    expect(wrapper.find('.database-explorer-tabs').exists()).toBe(false);

    wrapper.unmount();
  });

  describe('avisos de conclusão do servidor', () => {
    it('publica um aviso ao passar de rodando para falho', async () => {
      vi.useFakeTimers();

      const running: ManagedProcess = {
        id: 'proc-1',
        projectId: project.id,
        kind: 'server',
        status: 'running',
        port: 3000,
      };
      const failed: ManagedProcess = {
        ...running,
        status: 'failed',
        exitCode: 1,
      };

      fetchProjectProcess
        .mockResolvedValueOnce(running)
        .mockResolvedValueOnce(failed);

      const wrapper = mountServerPanel();
      await flushPromises();

      await vi.advanceTimersByTimeAsync(10_500);
      await flushPromises();

      expect(publishTerminalNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: project.id,
          processId: running.id,
          kind: 'server',
          status: 'failed',
        }),
      );

      wrapper.unmount();
    });

    it('não publica aviso quando o processo já chega parado sem nunca ter sido observado rodando', async () => {
      vi.useFakeTimers();

      fetchProjectProcess.mockResolvedValueOnce(null);
      const wrapper = mountServerPanel();
      await flushPromises();

      await vi.advanceTimersByTimeAsync(10_500);
      await flushPromises();

      expect(publishTerminalNotice).not.toHaveBeenCalled();

      wrapper.unmount();
    });
  });
});
