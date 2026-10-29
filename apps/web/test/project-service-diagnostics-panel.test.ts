import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchProjectServiceBindings,
  fetchServiceDependencyPreview,
  fetchServiceDiagnostics,
} = vi.hoisted(() => ({
  fetchProjectServiceBindings: vi.fn(),
  fetchServiceDependencyPreview: vi.fn(),
  fetchServiceDiagnostics: vi.fn(),
}));
vi.mock('../src/api/service-diagnostics', () => ({
  fetchProjectServiceBindings,
  fetchServiceDependencyPreview,
  fetchServiceDiagnostics,
}));
const routeControl = vi.hoisted(() => ({
  setServiceRef: (_id: string) => {},
}));
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  const query = reactive({ serviceRef: '' });
  routeControl.setServiceRef = (id: string) => {
    query.serviceRef = id;
  };
  return {
    useRoute: () => ({ query }),
    RouterLink: {
      props: ['to'],
      template:
        '<a :data-route="to.name" :data-environment="to.query?.environmentInstanceId"><slot /></a>',
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
const databaseRef = 'compose:loto:database';
const apiRef = 'compose:loto:api';
const cacheRef = 'compose:loto:cache';
const dependencyPreview = {
  target: {
    kind: 'project-environment',
    projectId: 'loto',
    environmentInstanceId: 'environment:primary:loto',
  },
  action: 'start',
  status: 'blocked',
  expectedRevision: 'a'.repeat(64),
  planHash: 'b'.repeat(64),
  observedAt: '2026-10-21T13:00:00Z',
  expiresAt: '2026-10-21T13:00:30Z',
  order: [databaseRef, cacheRef, apiRef],
  nodes: [
    {
      serviceRef: databaseRef,
      name: 'database',
      provider: 'compose',
      disposition: 'blocked',
      state: 'failed',
      readiness: 'unhealthy',
      relation: 'owned',
      ports: [],
      consumerCount: 1,
      dependencies: [],
      diagnostic: 'Readiness or a safe stopped state could not be proven.',
    },
    {
      serviceRef: cacheRef,
      name: 'cache',
      provider: 'compose',
      disposition: 'alreadyReady',
      state: 'running',
      readiness: 'ready',
      relation: 'owned',
      ports: [],
      consumerCount: 1,
      dependencies: [],
    },
    {
      serviceRef: apiRef,
      name: 'api',
      provider: 'compose',
      disposition: 'blocked',
      state: 'stopped',
      readiness: 'unknown',
      relation: 'owned',
      ports: [],
      consumerCount: 1,
      dependencies: [databaseRef],
      diagnostic: 'A dependency is blocked or its readiness is unknown.',
    },
  ],
  diagnostics: ['One or more services cannot be safely operated.'],
  executable: false,
};

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
    fetchServiceDependencyPreview.mockReset();
    fetchServiceDiagnostics.mockReset();
    routeControl.setServiceRef('');
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [binding(), binding('loto', 'environment:worktree:other')],
      partial: false,
    });
    fetchServiceDiagnostics.mockResolvedValue(snapshot);
    fetchServiceDependencyPreview.mockResolvedValue(dependencyPreview);
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

  it('checks dependency readiness only on demand and identifies the blocking node', async () => {
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [
        { ...binding(), serviceRef: databaseRef, role: 'PostgreSQL' },
        { ...binding(), id: 'cache', serviceRef: cacheRef },
        { ...binding(), id: 'api', serviceRef: apiRef },
      ],
      partial: false,
    });
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    expect(fetchServiceDependencyPreview).not.toHaveBeenCalled();
    expect(wrapper.find('.service-dependency-preview').exists()).toBe(false);
    await wrapper.get('.service-dependency-actions button').trigger('click');
    await flushPromises();

    expect(fetchServiceDependencyPreview).toHaveBeenCalledWith(
      'loto',
      'environment:primary:loto',
    );
    expect(fetchServiceDiagnostics).not.toHaveBeenCalled();
    const preview = wrapper.get('.service-dependency-preview');
    expect(preview.text()).toContain('1 de 3 serviços');
    expect(preview.text()).toContain('PostgreSQL');
    expect(preview.text()).toContain('Dependência bloqueante: PostgreSQL');
    expect(preview.text()).toContain('Isto não é progresso de execução');
    expect(preview.text()).toContain('Válido até:');
    expect(preview.findAll('li')).toHaveLength(3);

    await preview.findAll('li')[0]!.get('button').trigger('click');
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(
      databaseRef,
    );
    expect(fetchServiceDiagnostics).not.toHaveBeenCalled();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(fetchServiceDiagnostics).toHaveBeenCalledWith(
      'loto',
      databaseRef,
      undefined,
    );
    wrapper.unmount();
  });

  it('never offers log navigation for a missing dependency without an active binding', async () => {
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [{ ...binding(), serviceRef: apiRef }],
      partial: false,
    });
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    await wrapper.get('.service-dependency-actions button').trigger('click');
    await flushPromises();
    const preview = wrapper.get('.service-dependency-preview');
    expect(preview.findAll('li')).toHaveLength(3);
    expect(preview.findAll('li')[0]!.text()).toContain(
      'Sem vínculo ativo para consultar logs',
    );
    expect(preview.findAll('li')[0]!.find('button').exists()).toBe(false);
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(
      apiRef,
    );
    wrapper.unmount();
  });

  it('isolates an unavailable dependency preview without hiding existing log reads', async () => {
    fetchServiceDependencyPreview.mockRejectedValue(
      new Error('private provider password or filesystem path'),
    );
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    await wrapper.get('.service-dependency-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(
      'Não foi possível verificar as dependências',
    );
    expect(wrapper.text()).not.toContain('private provider password');
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.service-diagnostics-result').exists()).toBe(true);
    wrapper.unmount();
  });

  it('drops delayed dependency previews after a project change', async () => {
    let completePreview!: (value: typeof dependencyPreview) => void;
    fetchServiceDependencyPreview.mockImplementation(
      () =>
        new Promise<typeof dependencyPreview>((resolve) => {
          completePreview = resolve;
        }),
    );
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    await wrapper.get('.service-dependency-actions button').trigger('click');
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [],
      partial: false,
    });
    await wrapper.setProps({ projectId: 'other' });
    await flushPromises();
    completePreview(dependencyPreview);
    await flushPromises();
    expect(wrapper.find('.service-dependency-preview').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('1 de 3 serviços');
    wrapper.unmount();
  });

  it('never links systemd to Process Manager or invents a mutable provider screen', async () => {
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Provider apenas observável');
    expect(
      wrapper.findAll('a').map((link) => link.attributes('data-route')),
    ).not.toContain('project-server');
    expect(
      wrapper.findAll('a').map((link) => link.attributes('data-route')),
    ).not.toContain('project-compose');
    wrapper.unmount();
  });

  it('updates the selected bound unit when an Activity deep link changes', async () => {
    const second = 'systemd:user:other.service';
    fetchProjectServiceBindings.mockResolvedValue({
      bindings: [
        binding(),
        { ...binding(), id: 'binding2', serviceRef: second },
      ],
      partial: false,
    });
    routeControl.setServiceRef(second);
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(
      second,
    );
    await wrapper.get('.service-diagnostics-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.service-diagnostics-result').exists()).toBe(true);
    routeControl.setServiceRef(host);
    await flushPromises();
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(
      host,
    );
    expect(wrapper.find('.service-diagnostics-result').exists()).toBe(false);
    wrapper.unmount();
  });

  it('never substitutes a different service for an invalid deep link', async () => {
    routeControl.setServiceRef('systemd:user:removed.service');
    const wrapper = mount(ProjectServiceDiagnosticsPanel, {
      props: { projectId: 'loto' },
    });
    await flushPromises();
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('');
    expect(wrapper.text()).toContain('não está vinculado');
    expect(
      wrapper.get('.service-diagnostics-actions button').attributes('disabled'),
    ).toBeDefined();
    expect(fetchServiceDiagnostics).not.toHaveBeenCalled();

    routeControl.setServiceRef(host);
    await flushPromises();
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(
      host,
    );
    expect(wrapper.text()).not.toContain('não está vinculado');
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
