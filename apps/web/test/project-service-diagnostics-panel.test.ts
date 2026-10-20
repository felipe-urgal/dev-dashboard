import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProjectServiceBindings, fetchServiceDiagnostics } = vi.hoisted(() => ({
  fetchProjectServiceBindings: vi.fn(),
  fetchServiceDiagnostics: vi.fn(),
}));
vi.mock('../src/api/service-diagnostics', () => ({
  fetchProjectServiceBindings,
  fetchServiceDiagnostics,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}));

import ProjectServiceDiagnosticsPanel from '../src/components/ProjectServiceDiagnosticsPanel.vue';

const host = 'systemd:system:postgresql.service';
function binding(projectId = 'loto', environmentInstanceId = 'environment:primary:loto') {
  return {
    id: 'binding1', projectId, environmentInstanceId, serviceRef: host,
    enabled: true, relation: 'required', requiredForStart: true,
    dependencies: [], createdAt: '', updatedAt: '',
  };
}
const snapshot = {
  serviceRef: host, projectId: 'loto', environmentInstanceId: 'environment:primary:loto',
  provider: 'systemd', source: 'journal', status: 'unavailable', state: 'failed',
  readiness: 'unknown', readAt: new Date().toISOString(),
  observedAt: '2026-10-01T12:00:00Z', stale: true, partial: true,
  masked: false, truncated: false,
  diagnostic: 'Journal indisponível por permissão', events: [], jobs: [],
};

describe('ProjectServiceDiagnosticsPanel', () => {
  beforeEach(() => {
    fetchProjectServiceBindings.mockReset();
    fetchServiceDiagnostics.mockReset();
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [binding(), binding('loto', 'environment:worktree:other')],
      partial: false,
    });
    fetchServiceDiagnostics.mockResolvedValue(snapshot);
  });

  it('only reads logs on click, displays permission/freshness and preserves scoped environment', async () => {
    const wrapper = mount(ProjectServiceDiagnosticsPanel, { props: { projectId: 'loto' } });
    await flushPromises();
    expect(fetchProjectServiceBindings).toHaveBeenCalledWith('loto');
    expect(wrapper.findAll('option')).toHaveLength(1);
    expect(fetchServiceDiagnostics).not.toHaveBeenCalled();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(fetchServiceDiagnostics).toHaveBeenCalledWith('loto', host, undefined);
    expect(wrapper.text()).toContain('indisponível por permissão');
    expect(wrapper.text()).toContain('desatualizada');
    expect(wrapper.text()).toContain('Uma falha de permissão não significa log vazio');
  });

  it('drops prior selection and results when project/environment changes', async () => {
    const wrapper = mount(ProjectServiceDiagnosticsPanel, { props: { projectId: 'loto' } });
    await flushPromises();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('indisponível por permissão');
    fetchProjectServiceBindings.mockResolvedValue({ bindings: [], partial: false });
    await wrapper.setProps({ projectId: 'other' });
    await flushPromises();
    expect(wrapper.findAll('option')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('indisponível por permissão');
  });
});
