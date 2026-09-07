import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchMigrationOverview = vi.hoisted(() => vi.fn());

vi.mock('../src/api/migrations', async () => {
  const actual = await vi.importActual('../src/api/migrations');
  return { ...actual, fetchMigrationOverview };
});

import ProjectMigrationsPanel from '../src/components/ProjectMigrationsPanel.vue';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Dashboard',
  path: '/projects/dashboard',
  type: 'rails',
  source: 'workspace',
  enabled: true,
  capabilities: ['database'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectMigrationsPanel', () => {
  it('renderiza o contrato comum sem expor ações de mutation', async () => {
    fetchMigrationOverview.mockResolvedValue({
      provider: 'rails',
      status: 'pending',
      database: 'primary',
      applied: Array.from({ length: 22 }, (_, index) => ({
        id: String(index + 1).padStart(3, '0'),
        name: `Migration ${index + 1}`,
      })),
      pending: [{ id: '023', name: 'Add audit index' }],
      observedAt: '2026-09-07T16:00:00.000Z',
      evidence: 'Rails db:migrate:status',
      warnings: ['Banco secundário não foi consultado.'],
    });

    const wrapper = mount(ProjectMigrationsPanel, { props: { project } });
    await flushPromises();

    expect(fetchMigrationOverview).toHaveBeenCalledWith(project.id);
    expect(wrapper.text()).toContain('Pendente');
    expect(wrapper.text()).toContain('rails');
    expect(wrapper.text()).toContain('primary');
    expect(wrapper.text()).toContain('023');
    expect(wrapper.text()).toContain('Add audit index');
    expect(wrapper.text()).toContain('Rails db:migrate:status');
    expect(wrapper.text()).toContain('Banco secundário não foi consultado.');
    expect(wrapper.text()).toContain('20 mais recentes de 22');
    expect(wrapper.text()).not.toContain('Executar migration');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('mantém falha explícita e permite retry', async () => {
    fetchMigrationOverview
      .mockRejectedValueOnce(new Error('Provider indisponível'))
      .mockResolvedValueOnce({
        provider: 'prisma',
        status: 'up-to-date',
        database: 'primary',
        applied: [],
        pending: [],
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'prisma migrate status',
        warnings: [],
      });

    const wrapper = mount(ProjectMigrationsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Provider indisponível');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(fetchMigrationOverview).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Atualizado');
  });
});
