import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import ProjectServerPanel from '../src/components/ProjectServerPanel.vue';

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
  fetchProjectServerConfiguration: vi.fn().mockResolvedValue({
    settings: {},
    environments: [],
  }),
  fetchProjectServerSettings: vi.fn().mockResolvedValue({}),
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

  it('oferece iniciar o servidor quando ele está parado', async () => {
    fetchProjectProcess.mockResolvedValueOnce(null);

    const wrapper = mountServerPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('Parado');
    expect(wrapper.text()).toContain('Servidor parado');
    expect(wrapper.text()).toContain('Iniciar servidor');
    expect(wrapper.text()).not.toContain('Parar');

    wrapper.unmount();
  });

  it('oferece abrir, reiniciar e parar durante a execução', async () => {
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

    expect(wrapper.text()).toContain('Executando');
    expect(
      wrapper
        .get<HTMLAnchorElement>('a[aria-label="Abrir aplicação"]')
        .attributes('href'),
    ).toBe('http://localhost:3000');
    expect(wrapper.text()).toContain('Reiniciar');
    expect(wrapper.text()).toContain('Parar');

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
