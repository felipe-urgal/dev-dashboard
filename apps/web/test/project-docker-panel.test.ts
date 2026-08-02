import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProjectDockerPanel from '../src/components/ProjectDockerPanel.vue';
import { makeProject } from './support/activity-fixtures';

const api = vi.hoisted(() => ({
  fetchProjectDocker: vi.fn(),
  prepareComposeServiceAction: vi.fn(),
  runComposeServiceAction: vi.fn(),
  fetchComposeServiceLogs: vi.fn(),
}));

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  ...api,
}));

const overview = {
  configured: true,
  dockerAvailable: true,
  composeFile: 'compose.yaml',
  services: [
    { name: 'db', image: 'postgres:17', requiresBuild: false, ports: ['5433:5432'], dependsOn: [], running: true },
    { name: 'web', requiresBuild: true, ports: ['3100:3000'], dependsOn: ['db'], running: false },
  ],
};

afterEach(() => vi.clearAllMocks());

describe('painel Docker Compose', () => {
  it('lista serviços e impede start quando a imagem exige build', async () => {
    api.fetchProjectDocker.mockResolvedValue(overview);
    const wrapper = mount(ProjectDockerPanel, {
      props: { project: makeProject({ capabilities: ['docker'] }) },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('postgres:17');
    expect(wrapper.text()).toContain('5433:5432');
    const web = wrapper.findAll('.docker-service-card').find((card) => card.text().includes('web'))!;
    expect(web.text()).toContain('Requer build');
    expect(web.findAll('button')[0]!.attributes('disabled')).toBeDefined();
  });

  it('executa start direto e exige segundo clique para parar', async () => {
    api.fetchProjectDocker.mockResolvedValue(overview);
    api.runComposeServiceAction.mockResolvedValue({ serviceName: 'db', action: 'start', succeeded: true });
    api.prepareComposeServiceAction.mockResolvedValue({
      token: 't'.repeat(64), serviceName: 'db', action: 'stop', expiresAt: '2026-08-02T12:01:00.000Z',
    });
    const wrapper = mount(ProjectDockerPanel, {
      props: { project: makeProject({ capabilities: ['docker'] }) },
    });
    await flushPromises();
    let db = wrapper.findAll('.docker-service-card').find((card) => card.text().includes('db'))!;

    await db.findAll('button')[0]!.trigger('click');
    await flushPromises();
    expect(api.runComposeServiceAction).toHaveBeenCalledWith('p1', 'db', 'start', undefined);

    db = wrapper.findAll('.docker-service-card').find((card) => card.text().includes('db'))!;
    await db.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(api.prepareComposeServiceAction).toHaveBeenCalledWith('p1', 'db', 'stop');
    expect(api.runComposeServiceAction).toHaveBeenCalledTimes(1);
    await wrapper.find('.docker-confirmation .danger-button').trigger('click');
    await flushPromises();
    expect(api.runComposeServiceAction).toHaveBeenCalledWith('p1', 'db', 'stop', 't'.repeat(64));
  });

  it('mostra logs pontuais e o aviso de mascaramento', async () => {
    api.fetchProjectDocker.mockResolvedValue(overview);
    api.fetchComposeServiceLogs.mockResolvedValue({
      serviceName: 'db', content: 'db | password=[CONTEUDO_MASCARADO]', sizeBytes: 50,
      truncated: false, masked: true, redactionCount: 1, readAt: '2026-08-02T12:00:00.000Z',
    });
    const wrapper = mount(ProjectDockerPanel, {
      props: { project: makeProject({ capabilities: ['docker'] }) },
    });
    await flushPromises();
    const db = wrapper.findAll('.docker-service-card').find((card) => card.text().includes('db'))!;
    await db.findAll('button')[3]!.trigger('click');
    await flushPromises();
    expect(wrapper.get('.docker-logs').text()).toContain('CONTEUDO_MASCARADO');
    expect(wrapper.get('.docker-logs').text()).toContain('1 conteúdo(s) sensível(is)');
  });

  it('ignora logs que chegam depois da troca de projeto', async () => {
    api.fetchProjectDocker.mockResolvedValue(overview);
    let resolveLogs!: (value: {
      serviceName: string; content: string; sizeBytes: number; truncated: boolean;
      masked: boolean; redactionCount: number; readAt: string;
    }) => void;
    api.fetchComposeServiceLogs.mockImplementation(() => new Promise((resolve) => {
      resolveLogs = resolve;
    }));
    const wrapper = mount(ProjectDockerPanel, {
      props: { project: makeProject({ id: 'p1', capabilities: ['docker'] }) },
    });
    await flushPromises();
    const db = wrapper.findAll('.docker-service-card').find((card) => card.text().includes('db'))!;
    await db.findAll('button')[3]!.trigger('click');

    await wrapper.setProps({ project: makeProject({ id: 'p2', capabilities: ['docker'] }) });
    resolveLogs({
      serviceName: 'db', content: 'logs do projeto antigo', sizeBytes: 22,
      truncated: false, masked: false, redactionCount: 0, readAt: '2026-08-02T12:00:00.000Z',
    });
    await flushPromises();

    expect(wrapper.find('.docker-logs').exists()).toBe(false);
    expect(api.fetchComposeServiceLogs).toHaveBeenCalledWith('p1', 'db');
  });
});
