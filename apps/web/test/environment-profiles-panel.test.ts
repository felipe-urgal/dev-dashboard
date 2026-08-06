import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateEnvironmentProfileInput,
  EnvironmentProfile,
  EnvironmentProfileList,
} from '@dev-dashboard/contracts';

const baseProfiles: EnvironmentProfile[] = [
  {
    id: 'development',
    name: 'Desenvolvimento',
    variables: [
      { name: 'RAILS_ENV', value: 'development' },
      { name: 'API_TOKEN' },
    ],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-05T10:00:00.000Z',
  },
  {
    id: 'tests',
    name: 'Testes locais',
    variables: [{ name: 'RAILS_ENV', value: 'test' }],
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
  },
];

let currentList: EnvironmentProfileList;

const {
  fetchEnvironmentProfiles,
  createEnvironmentProfile,
  updateEnvironmentProfile,
  deleteEnvironmentProfile,
} = vi.hoisted(() => ({
  fetchEnvironmentProfiles: vi.fn(),
  createEnvironmentProfile: vi.fn(),
  updateEnvironmentProfile: vi.fn(),
  deleteEnvironmentProfile: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchEnvironmentProfiles,
  createEnvironmentProfile,
  updateEnvironmentProfile,
  deleteEnvironmentProfile,
}));

import EnvironmentProfilesPanel from '../src/components/EnvironmentProfilesPanel.vue';

function cloneProfile(profile: EnvironmentProfile): EnvironmentProfile {
  return {
    ...profile,
    variables: profile.variables.map((variable) => ({ ...variable })),
  };
}

beforeEach(() => {
  currentList = {
    profiles: baseProfiles.map(cloneProfile),
    limits: {
      maxProfiles: 20,
      maxVariablesPerProfile: 30,
      maxNameLength: 100,
      maxValueLength: 4096,
    },
  };

  fetchEnvironmentProfiles.mockImplementation(async () => ({
    ...currentList,
    profiles: currentList.profiles.map(cloneProfile),
  }));
  createEnvironmentProfile.mockReset();
  updateEnvironmentProfile.mockReset();
  deleteEnvironmentProfile.mockReset();
});

describe('EnvironmentProfilesPanel', () => {
  it('carrega a lista lateral e mantém o perfil selecionado no editor', async () => {
    const wrapper = mount(EnvironmentProfilesPanel);
    await flushPromises();

    expect(wrapper.find('.environment-profiles-layout').exists()).toBe(true);
    expect(wrapper.findAll('.environment-profile-list-item')).toHaveLength(2);
    expect(
      wrapper.find('.environment-profile-list-item.is-selected').text(),
    ).toContain('Desenvolvimento');
    expect(
      wrapper.get<HTMLInputElement>('#environment-profile-name-input').element
        .value,
    ).toBe('Desenvolvimento');
    expect(wrapper.text()).toContain('2 variáveis configuradas');
  });

  it('troca de perfil sem sair do editor dividido', async () => {
    const wrapper = mount(EnvironmentProfilesPanel);
    await flushPromises();

    await wrapper
      .findAll('.environment-profile-list-item')[1]
      ?.trigger('click');

    expect(
      wrapper.find('.environment-profile-list-item.is-selected').text(),
    ).toContain('Testes locais');
    expect(
      wrapper.get<HTMLInputElement>('#environment-profile-name-input').element
        .value,
    ).toBe('Testes locais');
    expect(wrapper.findAll('.environment-profile-variable-row')).toHaveLength(
      1,
    );
  });

  it('filtra a lista de perfis pelo campo de busca', async () => {
    const wrapper = mount(EnvironmentProfilesPanel);
    await flushPromises();

    await wrapper.get('.environment-profiles-search input').setValue('teste');

    const items = wrapper.findAll('.environment-profile-list-item');
    expect(items).toHaveLength(1);
    expect(items[0]?.text()).toContain('Testes locais');
  });

  it('mostra alterações não salvas e descarta ao clicar em Descartar', async () => {
    const wrapper = mount(EnvironmentProfilesPanel);
    await flushPromises();

    expect(wrapper.find('.environment-profile-unsaved-bar').exists()).toBe(
      false,
    );

    await wrapper.get('#environment-profile-name-input').setValue('Editado');
    expect(wrapper.find('.environment-profile-unsaved-bar').exists()).toBe(
      true,
    );

    await wrapper
      .get('.environment-profile-unsaved-bar button')
      .trigger('click');

    expect(
      wrapper.get<HTMLInputElement>('#environment-profile-name-input').element
        .value,
    ).toBe('Desenvolvimento');
    expect(wrapper.find('.environment-profile-unsaved-bar').exists()).toBe(
      false,
    );
  });

  it('cria um perfil e não envia valor de variável sensível', async () => {
    createEnvironmentProfile.mockImplementation(
      async (input: CreateEnvironmentProfileInput) => {
        const created: EnvironmentProfile = {
          id: 'homologacao',
          name: input.name,
          variables: input.variables,
          createdAt: '2026-08-05T12:00:00.000Z',
          updatedAt: '2026-08-05T12:00:00.000Z',
        };
        currentList.profiles.push(created);
        return cloneProfile(created);
      },
    );

    const wrapper = mount(EnvironmentProfilesPanel);
    await flushPromises();

    await wrapper
      .find('.environment-profiles-sidebar-footer button')
      .trigger('click');
    await wrapper
      .get('#environment-profile-name-input')
      .setValue('Homologação');

    const variableRow = wrapper.get('.environment-profile-variable-row');
    const inputs = variableRow.findAll('input');
    await inputs[0]?.setValue('API_TOKEN');

    expect((inputs[1]?.element as HTMLInputElement).disabled).toBe(true);

    await wrapper.get('form.environment-profile-editor').trigger('submit');
    await flushPromises();

    expect(createEnvironmentProfile).toHaveBeenCalledWith({
      name: 'Homologação',
      variables: [{ name: 'API_TOKEN' }],
    });
    expect(
      wrapper.find('.environment-profile-list-item.is-selected').text(),
    ).toContain('Homologação');
  });
});
