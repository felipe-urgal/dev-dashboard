import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

import ProjectDatabasePanel from '../src/components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../src/components/ProjectGitPanel.vue';
import ProjectScriptsPanel from '../src/components/ProjectScriptsPanel.vue';
import ProjectServerPanel from '../src/components/ProjectServerPanel.vue';
import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  fetchProjectProcess: vi.fn().mockResolvedValue(null),
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
});
