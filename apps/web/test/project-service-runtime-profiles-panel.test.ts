import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchProjectServiceBindings,
  fetchRuntimeProfiles,
  fetchRuntimeProfilePlan,
  saveRuntimeProfile,
  removeRuntimeProfile,
} = vi.hoisted(() => ({
  fetchProjectServiceBindings: vi.fn(),
  fetchRuntimeProfiles: vi.fn(),
  fetchRuntimeProfilePlan: vi.fn(),
  saveRuntimeProfile: vi.fn(),
  removeRuntimeProfile: vi.fn(),
}));

vi.mock('../src/api/service-diagnostics', () => ({
  fetchProjectServiceBindings,
}));
vi.mock('../src/api/service-runtime-profiles', () => ({
  fetchRuntimeProfiles,
  fetchRuntimeProfilePlan,
  saveRuntimeProfile,
  removeRuntimeProfile,
}));

import ProjectServiceRuntimeProfilesPanel from '../src/components/ProjectServiceRuntimeProfilesPanel.vue';

const ENV = 'environment:primary:gastos';
const TEST_ID = '11111111-1111-4111-8111-111111111111';
const PROD_ID = '22222222-2222-4222-8222-222222222222';
const TEST_BINDING = '33333333-3333-4333-8333-333333333333';
const PROD_BINDING = '44444444-4444-4444-8444-444444444444';
const TEST_REF = 'compose:gastos:test-db';
const PROD_REF = 'compose:gastos:prod-db';
const REV = 'a'.repeat(64);
const BINDING_REV = 'b'.repeat(64);
const TIME = '2026-10-20T18:00:00.000Z';

function binding(id: string, serviceRef: string, environmentInstanceId = ENV) {
  return {
    id,
    projectId: 'gastos',
    environmentInstanceId,
    serviceRef,
    role: 'database',
    relation: 'required',
    requiredForStart: true,
    enabled: true,
    dependencies: [],
    createdAt: TIME,
    updatedAt: TIME,
    availability: 'observed',
    shared: id === TEST_BINDING,
    consumerCount: id === TEST_BINDING ? 2 : 1,
  };
}
function profile(
  id: string,
  kind: 'test' | 'production',
  bindingIds: string[],
) {
  return {
    id,
    kind,
    projectId: 'gastos',
    environmentInstanceId: ENV,
    bindingIds,
    createdAt: TIME,
    updatedAt: TIME,
    staleBindingIds: [],
  };
}
function planNode(ref: string, port: number, disposition = 'alreadyReady') {
  return {
    serviceRef: ref,
    name: ref,
    provider: 'compose',
    disposition,
    state: 'running',
    readiness: 'ready',
    relation: 'required',
    ports: [port],
    consumerCount: ref === TEST_REF ? 2 : 1,
    dependencies: [],
  };
}
function plan(action: 'start' | 'stop', profileId?: string) {
  return {
    target: {
      kind: 'project-environment',
      projectId: 'gastos',
      environmentInstanceId: ENV,
    },
    action,
    status: 'ready',
    expectedRevision: BINDING_REV,
    planHash: 'c'.repeat(64),
    observedAt: TIME,
    expiresAt: '2026-10-20T18:00:30.000Z',
    order: profileId ? [TEST_REF] : [TEST_REF, PROD_REF],
    nodes: profileId
      ? [
          planNode(
            TEST_REF,
            5544,
            action === 'stop' ? 'retained' : 'alreadyReady',
          ),
        ]
      : [planNode(TEST_REF, 5544), planNode(PROD_REF, 5432)],
    diagnostics: [],
    executable: false,
    ...(profileId
      ? { profile: { id: profileId, kind: 'test', revision: REV } }
      : {}),
  };
}
function profilesWithData() {
  return {
    projectId: 'gastos',
    environmentInstanceId: ENV,
    revision: REV,
    bindingsRevision: BINDING_REV,
    fallback: false,
    profiles: [
      profile(TEST_ID, 'test', [TEST_BINDING]),
      profile(PROD_ID, 'production', [PROD_BINDING]),
    ],
  };
}

function mountPanel() {
  return mount(ProjectServiceRuntimeProfilesPanel, {
    props: { projectId: 'gastos' },
  });
}

describe('ProjectServiceRuntimeProfilesPanel', () => {
  beforeEach(() => {
    fetchProjectServiceBindings.mockReset();
    fetchRuntimeProfiles.mockReset();
    fetchRuntimeProfilePlan.mockReset();
    saveRuntimeProfile.mockReset();
    removeRuntimeProfile.mockReset();
    fetchProjectServiceBindings.mockResolvedValue({
      revision: BINDING_REV,
      bindings: [
        binding(TEST_BINDING, TEST_REF),
        binding(PROD_BINDING, PROD_REF),
        binding(
          '55555555-5555-4555-8555-555555555555',
          'compose:loto:foreign',
          'environment:worktree:loto:one',
        ),
      ],
      partial: false,
    });
    fetchRuntimeProfiles.mockResolvedValue(profilesWithData());
    fetchRuntimeProfilePlan.mockImplementation(
      (_project: string, _env: string, action: 'start' | 'stop', id?: string) =>
        Promise.resolve(plan(action, id)),
    );
    saveRuntimeProfile.mockResolvedValue({
      profile: profile(TEST_ID, 'test', [PROD_BINDING]),
      revision: REV,
      bindingsRevision: BINDING_REV,
    });
    removeRuntimeProfile.mockResolvedValue({ revision: REV });
  });

  it('preserves fallback, displays an observational plan, and never mutates on selection', async () => {
    fetchRuntimeProfiles.mockResolvedValue({
      ...profilesWithData(),
      profiles: [],
      fallback: true,
    });
    const wrapper = mountPanel();
    await flushPromises();
    expect(fetchRuntimeProfilePlan).toHaveBeenCalledWith(
      'gastos',
      ENV,
      'start',
      undefined,
    );
    expect(wrapper.get('#runtime-profile-select').text()).toContain('Padrão');
    expect(wrapper.findAll('#runtime-profile-select option')).toHaveLength(1);
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('não executável');
    expect(saveRuntimeProfile).not.toHaveBeenCalled();
    expect(removeRuntimeProfile).not.toHaveBeenCalled();
  });

  it('filters selected test services, identifies omitted prod DB and port differences, without lifecycle', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('#runtime-profile-select').setValue(TEST_ID);
    await flushPromises();
    expect(fetchRuntimeProfilePlan).toHaveBeenCalledWith(
      'gastos',
      ENV,
      'start',
      TEST_ID,
    );
    expect(fetchRuntimeProfilePlan).toHaveBeenCalledWith(
      'gastos',
      ENV,
      'start',
      undefined,
    );
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('compose:gastos:prod-db');
    expect(wrapper.text()).toContain('5432');
    expect(wrapper.text()).toContain('5544');
    expect(wrapper.text()).toContain('Diferenças de portas observadas');
    expect(wrapper.text()).toContain('compartilhados');
    await wrapper.get('#runtime-plan-action').setValue('stop');
    await flushPromises();
    expect(fetchRuntimeProfilePlan).toHaveBeenCalledWith(
      'gastos',
      ENV,
      'stop',
      TEST_ID,
    );
    expect(wrapper.text()).toContain('Preservado');
    expect(wrapper.text()).toContain('não executável');
    expect(saveRuntimeProfile).not.toHaveBeenCalled();
    expect(removeRuntimeProfile).not.toHaveBeenCalled();
  });

  it('edits only eligible environment bindings with opaque collection revisions', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('#runtime-profile-select').setValue(TEST_ID);
    await flushPromises();
    const edit = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Editar seleção');
    expect(edit).toBeDefined();
    await edit!.trigger('click');
    const checks = wrapper.findAll('input[type="checkbox"]');
    expect(checks).toHaveLength(2);
    await checks[0]!.setValue(false);
    await checks[1]!.setValue(true);
    const submit = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Salvar perfil');
    await submit!.trigger('click');
    await flushPromises();
    expect(saveRuntimeProfile).toHaveBeenCalledWith(
      'gastos',
      ENV,
      {
        kind: 'test',
        bindingIds: [PROD_BINDING],
        expectedRevision: REV,
        expectedBindingsRevision: BINDING_REV,
      },
      TEST_ID,
    );
  });

  it('requires explicit second confirmation before deleting configuration', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('#runtime-profile-select').setValue(TEST_ID);
    await flushPromises();
    const remove = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Excluir perfil…');
    await remove!.trigger('click');
    expect(removeRuntimeProfile).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Nenhum serviço será parado');
    const confirm = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Confirmar exclusão');
    await confirm!.trigger('click');
    await flushPromises();
    expect(removeRuntimeProfile).toHaveBeenCalledWith(
      'gastos',
      ENV,
      TEST_ID,
      REV,
    );
  });

  it('fails closed on revision drift instead of saving against inconsistent bindings', async () => {
    fetchProjectServiceBindings.mockResolvedValue({
      revision: 'f'.repeat(64),
      bindings: [binding(TEST_BINDING, TEST_REF)],
      partial: false,
    });
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('vínculos mudaram');
    const create = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Novo perfil');
    expect(create?.attributes('disabled')).toBeDefined();
    expect(fetchRuntimeProfilePlan).not.toHaveBeenCalled();
    expect(saveRuntimeProfile).not.toHaveBeenCalled();
  });

  it('discards the previous environment before rendering a different project', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('#runtime-profile-select').setValue(TEST_ID);
    await flushPromises();
    fetchRuntimeProfiles.mockResolvedValue({
      projectId: 'loto',
      environmentInstanceId: 'environment:primary:loto',
      revision: REV,
      bindingsRevision: BINDING_REV,
      fallback: true,
      profiles: [],
    });
    fetchProjectServiceBindings.mockResolvedValue({
      revision: BINDING_REV,
      bindings: [],
      partial: false,
    });
    await wrapper.setProps({ projectId: 'loto' });
    await flushPromises();
    expect(fetchRuntimeProfiles).toHaveBeenCalledWith(
      'loto',
      'environment:primary:loto',
    );
    expect(wrapper.findAll('#runtime-profile-select option')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Diferenças de portas observadas');
  });

  it('keeps the production context read-only even when Stop is previewed', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('#runtime-profile-select').setValue(PROD_ID);
    await flushPromises();
    expect(wrapper.text()).toContain('Production Contract');
    await wrapper.get('#runtime-plan-action').setValue('stop');
    await flushPromises();
    expect(fetchRuntimeProfilePlan).toHaveBeenCalledWith(
      'gastos',
      ENV,
      'stop',
      PROD_ID,
    );
    expect(wrapper.text()).toContain('não executável');
    expect(saveRuntimeProfile).not.toHaveBeenCalled();
    expect(removeRuntimeProfile).not.toHaveBeenCalled();
  });

  it('reports read-only preview errors without giving a false green plan', async () => {
    fetchRuntimeProfilePlan.mockRejectedValue(new Error('409'));
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('Prévia indisponível');
    expect(wrapper.findAll('tbody tr')).toHaveLength(0);
    expect(saveRuntimeProfile).not.toHaveBeenCalled();
  });
});
