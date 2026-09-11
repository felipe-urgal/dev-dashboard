import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchReleaseReadiness = vi.hoisted(() => vi.fn());

vi.mock('../src/api/release-readiness', async () => {
  const actual = await vi.importActual('../src/api/release-readiness');
  return { ...actual, fetchReleaseReadiness };
});

import ProjectReleaseReadinessPanel from '../src/components/ProjectReleaseReadinessPanel.vue';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Dashboard',
  path: '/projects/dashboard',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git', 'server'],
};

function mountPanel() {
  return mount(ProjectReleaseReadinessPanel, {
    props: { project },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template:
            '<a class="router-link-stub" :data-name="to.name" :data-tab="to.query?.tab || \'\'"><slot /></a>',
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectReleaseReadinessPanel', () => {
  it('renderiza o checklist de entrega e navega para os domínios responsáveis', async () => {
    fetchReleaseReadiness.mockResolvedValue({
      state: 'block',
      generatedAt: '2026-09-06T17:00:00.000Z',
      checks: [
        {
          id: 'doctor',
          state: 'pass',
          summary: 'Project Doctor saudável',
          evidence: '8 checks passaram sem bloqueadores.',
          observedAt: '2026-09-06T16:59:00.000Z',
          action: { label: 'Abrir Doctor', target: 'doctor' },
        },
        {
          id: 'migrations',
          state: 'block',
          summary: 'Existem migrations pendentes',
          evidence: 'Migration provider encontrou pendências.',
          observedAt: '2026-09-06T16:59:30.000Z',
          action: { label: 'Abrir Migrations', target: 'migrations' },
        },
        {
          id: 'git',
          state: 'block',
          summary: 'Branch está atrás da referência remota',
          evidence: '2 commits atrás de origin/main.',
          observedAt: '2026-09-06T16:59:00.000Z',
          action: { label: 'Abrir Sincronização', target: 'synchronization' },
        },
        {
          id: 'tests',
          state: 'unknown',
          summary: 'Sem suíte completa comparável',
          evidence: 'Nenhuma execução completa foi registrada.',
          observedAt: '2026-09-06T16:59:00.000Z',
          action: { label: 'Abrir Testes', target: 'tests' },
        },
      ],
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(fetchReleaseReadiness).toHaveBeenCalledWith(project.id);
    expect(wrapper.text()).toContain('Release Readiness');
    expect(wrapper.text()).toContain('Checklist de entrega');
    expect(wrapper.text()).toContain('Bloqueado');
    expect(wrapper.text()).toContain('Inconclusivo');
    expect(wrapper.text()).toContain('Pronto');
    expect(wrapper.text()).toContain('Existem migrations pendentes');
    expect(wrapper.text()).toContain('Não autoriza merge, push ou deploy.');
    expect(wrapper.find('.readiness-state--block').exists()).toBe(true);
    expect(wrapper.find('.readiness-checklist').exists()).toBe(true);
    expect(wrapper.findAll('.readiness-check')).toHaveLength(4);

    const domains = wrapper
      .findAll('.readiness-check-domain')
      .map((node) => node.text());
    expect(domains).toEqual(['Git', 'Testes', 'Doctor', 'Migrations']);

    const links = wrapper.findAll('.router-link-stub');
    expect(links).toHaveLength(4);
    expect(links[0]?.attributes('data-name')).toBe('project-git');
    expect(links[0]?.attributes('data-tab')).toBe('sync');
    expect(links[1]?.attributes('data-name')).toBe('project-tests');
    expect(links[2]?.attributes('data-name')).toBe('project-doctor');
    expect(links[3]?.attributes('data-name')).toBe('project-migrations');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('mostra o estado pronto sem inventar ações de entrega', async () => {
    fetchReleaseReadiness.mockResolvedValue({
      state: 'pass',
      generatedAt: '2026-09-06T17:00:00.000Z',
      checks: [],
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('Pronto');
    expect(wrapper.text()).toContain(
      'As evidências disponíveis estão recentes e não apresentam bloqueadores.',
    );
    expect(wrapper.text()).toContain('Resultado consolidado das evidências');
    expect(wrapper.find('.readiness-state--pass').exists()).toBe(true);
  });

  it('mantém falha de carregamento explícita e permite retry', async () => {
    fetchReleaseReadiness
      .mockRejectedValueOnce(new Error('Readiness indisponível'))
      .mockResolvedValueOnce({
        state: 'pass',
        generatedAt: '2026-09-06T17:00:00.000Z',
        checks: [],
      });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('Readiness indisponível');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(fetchReleaseReadiness).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Pronto');
  });
});
