import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../src/components/ProjectGitPanel.vue';
import ProjectScriptsPanel from '../src/components/ProjectScriptsPanel.vue';
import ProjectServerPanel from '../src/components/ProjectServerPanel.vue';
import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';

const fetchProjectProcess = vi.fn().mockResolvedValue(null);

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  fetchActivities: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 4,
    total: 0,
    totalPages: 0,
    summary: { running: 0, succeeded: 0, failed: 0, total: 0 },
  }),
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
  fetchProjectServerSettings: vi.fn().mockResolvedValue({}),
  fetchProjectTests: vi.fn().mockResolvedValue({ supported: false, commands: [] }),
  fetchProjectTestProcess: vi.fn().mockResolvedValue(null),
  fetchProjectTestLog: vi.fn().mockResolvedValue({ content: '', truncated: false }),
  fetchProjectGit: vi.fn().mockResolvedValue({
    repository: false,
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
    stashes: [],
  }),
  fetchProjectGitDiff: vi.fn().mockResolvedValue({
    repository: false,
    scope: 'combined',
    files: [],
  }),
  fetchProjectDatabase: vi.fn().mockResolvedValue({ supported: false, environments: [], total: 0, page: 1, pageSize: 20 }),
  fetchProjectScripts: vi.fn().mockResolvedValue({ items: [], page: 1, totalPages: 1, total: 0 }),
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
    publishTerminalNotice: (...args: unknown[]) => publishTerminalNotice(...args),
  },
}));

const project: Project = {
  id: 'projeto-card',
  workspaceId: 'workspace-card',
  name: 'Projeto Card',
  path: '/tmp/projeto-card',
  type: 'node',
  source: 'workspace',
  favorite: false,
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

  it('renderiza o painel operacional do servidor', async () => {
    const wrapper = mountServerPanel();
    await flushPromises();

    expect(wrapper.find('.server-dashboard').exists()).toBe(true);
    expect(wrapper.find('.server-config-card').exists()).toBe(true);
    expect(wrapper.find('.server-status-card').exists()).toBe(true);
    expect(wrapper.find('.server-log-preview-card').exists()).toBe(true);

    wrapper.unmount();
  });

  it('renderiza o painel Git com sua navegação própria', async () => {
    const wrapper = mount(ProjectGitPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.find('.git-modern-panel').exists()).toBe(true);
    expect(wrapper.find('.git-subtabs').exists()).toBe(true);
    expect(wrapper.findAll('.git-subtabs button')).toHaveLength(7);

    wrapper.unmount();
  });

  it('renderiza o painel de testes dentro de Card', async () => {
    const wrapper = mount(ProjectTestsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.get('.dd-card').classes()).toContain('project-detail-card');
    expect(wrapper.find('.dd-card-header').exists()).toBe(true);

    wrapper.unmount();
  });

  it('renderiza scripts como explorador com navegação própria', async () => {
    const wrapper = mount(ProjectScriptsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.find('.scripts-explorer').exists()).toBe(true);
    expect(wrapper.find('.scripts-explorer-header').exists()).toBe(true);
    expect(wrapper.find('.scripts-explorer-tabs').exists()).toBe(true);
    expect(wrapper.findAll('.scripts-explorer-tabs button')).toHaveLength(3);

    wrapper.unmount();
  });

  it('renderiza banco de dados como explorador com navegação própria', async () => {
    const wrapper = mount(ProjectDatabasePanel, { props: { project } });
    await flushPromises();

    expect(wrapper.find('.database-explorer').exists()).toBe(true);
    expect(wrapper.find('.database-explorer-header').exists()).toBe(true);
    expect(wrapper.find('.database-explorer-tabs').exists()).toBe(true);
    expect(wrapper.findAll('.database-explorer-tabs button')).toHaveLength(2);

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

      expect(publishTerminalNotice).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5_000);
      await flushPromises();

      expect(publishTerminalNotice).toHaveBeenCalledTimes(1);
      expect(publishTerminalNotice).toHaveBeenCalledWith({
        origin: 'server',
        dedupeKey: 'server:proc-1:failed',
        outcome: 'failed',
        projectId: project.id,
        projectName: project.name,
        label: project.name,
        routeTo: { name: 'project-server', params: { projectId: project.id } },
      });

      wrapper.unmount();
    });

    it('não publica aviso quando o processo já chega parado sem nunca ter sido observado rodando', async () => {
      fetchProjectProcess.mockResolvedValueOnce(null);
      const wrapper = mountServerPanel();
      await flushPromises();

      expect(publishTerminalNotice).not.toHaveBeenCalled();

      wrapper.unmount();
    });
  });
});
