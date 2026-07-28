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
  fetchProjectProcess: (...args: unknown[]) => fetchProjectProcess(...args),
  fetchProjectProcessLog: vi.fn().mockResolvedValue(null),
  fetchProjectServerSettings: vi.fn().mockResolvedValue({}),
  fetchProjectTests: vi.fn().mockResolvedValue({ supported: false, commands: [] }),
  fetchProjectTestProcess: vi.fn().mockResolvedValue(null),
  fetchProjectTestLog: vi.fn().mockResolvedValue({ content: '', truncated: false }),
  fetchProjectGit: vi.fn().mockResolvedValue({ repository: false }),
  fetchProjectGitDiff: vi.fn().mockResolvedValue({ files: [] }),
  fetchProjectDatabase: vi.fn().mockResolvedValue({ supported: false, environments: [], total: 0, pageSize: 20 }),
  fetchProjectScripts: vi.fn().mockResolvedValue({ items: [], page: 1, totalPages: 1, total: 0 }),
  fetchScriptExecutionHistory: vi.fn().mockResolvedValue({ items: [] }),
  fetchLatestScriptExecution: vi.fn().mockResolvedValue(null),
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

describe('cards dos painéis de detalhe', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['servidor', ProjectServerPanel],
    ['Git', ProjectGitPanel],
    ['testes', ProjectTestsPanel],
    ['banco de dados', ProjectDatabasePanel],
    ['scripts', ProjectScriptsPanel],
  ])('renderiza o painel de %s dentro de Card', async (_name, component) => {
    const wrapper = mount(component, { props: { project } });
    await flushPromises();

    expect(wrapper.get('.dd-card').classes()).toContain('project-detail-card');
    expect(wrapper.find('.dd-card-header').exists()).toBe(true);

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

      const wrapper = mount(ProjectServerPanel, { props: { project } });
      await flushPromises();

      expect(publishTerminalNotice).not.toHaveBeenCalled();

      // O status "running" agenda o próximo polling em 5s (ver
      // scheduleProcessPolling em useProjectProcessStatus.ts).
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
        routeTo: { name: 'project-details', params: { projectId: project.id } },
      });

      wrapper.unmount();
    });

    it('não publica aviso quando o processo já chega parado sem nunca ter sido observado rodando', async () => {
      fetchProjectProcess.mockResolvedValueOnce(null);

      const wrapper = mount(ProjectServerPanel, { props: { project } });
      await flushPromises();

      expect(publishTerminalNotice).not.toHaveBeenCalled();

      wrapper.unmount();
    });
  });
});
