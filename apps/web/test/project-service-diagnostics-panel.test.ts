import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProjectServiceBindings, fetchServiceDiagnostics } = vi.hoisted(
  () => ({
    fetchProjectServiceBindings: vi.fn(),
    fetchServiceDiagnostics: vi.fn(),
  }),
);
vi.mock('../src/api/service-diagnostics', () => ({
  fetchProjectServiceBindings,
  fetchServiceDiagnostics,
}));
const routeControl = vi.hoisted(() => ({
  setServiceRef: (_id: string) => {},
}));
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  const query = reactive({ serviceRef: '' });
  routeControl.setServiceRef = (id: string) => { query.serviceRef = id; };
  return {
    useRoute: () => ({ query }),
    RouterLink: {
      props: ['to'],
      template: '<a :data-route="to.name" :data-environment="to.query?.environmentInstanceId"><slot /></a>',
    },
  };
});

import ProjectServiceDiagnosticsPanel from '../src/components/ProjectServiceDiagnosticsPanel.vue';

const host = 'systemd:system:postgresql.service';
function binding(
  projectId = 'loto',
  environmentInstanceId = 'environment:primary:loto',
) {
  return {
    id: 'binding1',
    projectId,
    environmentInstanceId,
    serviceRef: host,
    enabled: true,
    relation: 'required',
    requiredForStart: true,
    dependencies: [],
    createdAt: '',
    updatedAt: '',
  };
}
const snapshot = {
  serviceRef: host,
  projectId: 'loto',
  environmentInstanceId: 'environment:primary:loto',
  provider: 'systemd',
  source: 'journal',
  status: 'unavailable',
  state: 'failed',
  readiness: 'unknown',
  readAt: new Date().toISOString(),
  observedAt: '2026-10-01T12:00:00Z',
  stale: true,
  partial: true,
  masked: false,
  truncated: false,
  diagnostic: 'Journal indisponível por permissão',
  events: [],
  jobs: [],
};

describe('ProjectServiceDiagnosticsPanel', () => {
  beforeEach(() => {
    fetchProjectServiceBindings.mockReset();
    fetchServiceDiagnostics.mockReset();
    routeControl.setServiceRef('');
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [binding(), binding('loto', 'environment:worktree:other')],
      partial: false,
    });
    fetchServiceDiagnostics.mockResolvedValue(snapshot);
  });

  it('only reads logs on click, displays permission/freshness and preserves scoped environment', async () => {
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    expect(fetchProjectServiceBindings).toHaveBeenCalledWith('loto');
    expect(wrapper.findAll('option')).toHaveLength(1);
    expect(fetchServiceDiagnostics).not.toHaveBeenCalled();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(fetchServiceDiagnostics).toHaveBeenCalledWith(
      'loto',
      host,
      undefined,
    );
    expect(wrapper.text()).toContain('indisponível por permissão');
    expect(wrapper.text()).toContain('desatualizada');
    expect(wrapper.text()).toContain(
      'Uma falha de permissão não significa log vazio',
    );
  });

  it('never links systemd to Process Manager or invents a mutable provider screen', async () => {
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Provider apenas observável');
    expect(wrapper.findAll('a').map((link) => link.attributes('data-route'))).not.toContain('project-server');
    expect(wrapper.findAll('a').map((link) => link.attributes('data-route'))).not.toContain('project-compose');
    wrapper.unmount();
  });

  it('routes exclusively owned Compose to Compose with the environment context', async () => {
    const serviceRef = 'compose:loto:api';
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [{ ...binding(), serviceRef }],
      partial: false,
    });
    fetchServiceDiagnostics.mockResolvedValue({ ...snapshot, serviceRef, provider: 'compose' });
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto', environmentInstanceId: 'environment:primary:loto' },
    });
    await flushPromises();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    const providerLink = wrapper.findAll('a').find((link) => link.text().includes('Abrir ferramenta do provider'));
    expect(providerLink?.attributes('data-route')).toBe('project-compose');
    expect(providerLink?.attributes('data-environment')).toBe('environment:primary:loto');
    wrapper.unmount();
  });

  it('updates the selected bound unit when an Activity deep link changes', async () => {
    const second = 'systemd:user:other.service';
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [binding(), { ...binding(), id: 'binding2', serviceRef: second }],
      partial: false,
    });
    routeControl.setServiceRef(second);
    const wrapper = mount(ProjectServiceDiagnosticsPanel, { props: { projectId: 'loto' } });
    await flushPromises();
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(second);
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.service-diagnostics-result').exists()).toBe(true);
    routeControl.setServiceRef(host);
    await flushPromises();
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(host);
    expect(wrapper.find('.service-diagnostics-result').exists()).toBe(false);
    wrapper.unmount();
  });

  it('drops prior selection and results when project/environment changes', async () => {
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('indisponível por permissão');
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [],
      partial: false,
    });
    await wrapper.setProps({ projectId: 'other' });
    await flushPromises();
    expect(wrapper.findAll('option')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('indisponível por permissão');
  });
});
