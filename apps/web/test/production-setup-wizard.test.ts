import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchProductionContractSetup: vi.fn(),
  previewProductionContract: vi.fn(),
  saveProductionContract: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProductionSetupWizard from '../src/components/production/ProductionSetupWizard.vue';

function preview(valid: boolean, missingScripts: string[] = []) {
  return {
    valid,
    missingScripts,
    ...(valid
      ? {}
      : { message: 'strategy=command exige os scripts canônicos.' }),
    manifest: { version: 1 as const, production: { strategy: 'command' } },
  };
}

function mountWizard() {
  return mount(ProductionSetupWizard, {
    props: { projectId: 'p1', defaultBranch: 'main' },
  });
}

describe('ProductionSetupWizard', () => {
  beforeEach(() => {
    vi.useRealTimers();
    for (const mock of Object.values(api)) mock.mockReset();
    api.fetchProductionContractSetup.mockResolvedValue({
      scripts: ['prod:status', 'prod:check', 'prod:deploy', 'prod:verify'],
      manifestExists: false,
    });
    api.previewProductionContract.mockResolvedValue(preview(true));
  });

  it('só libera "Criar contrato" quando o contrato é válido e mostra o que falta', async () => {
    api.previewProductionContract.mockResolvedValue(
      preview(false, ['prod:verify']),
    );
    const wrapper = mountWizard();
    await flushPromises();

    expect(wrapper.text()).toContain('strategy=command exige os scripts');
    expect(wrapper.text()).toContain('prod:verify');
    const create = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Criar contrato'))!;
    expect(create.attributes('disabled')).toBeDefined();
  });

  it('cria o contrato com as operações obrigatórias e avisa que foi salvo', async () => {
    api.saveProductionContract.mockResolvedValue(preview(true));
    const wrapper = mountWizard();
    await flushPromises();

    const create = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Criar contrato'))!;
    expect(create.attributes('disabled')).toBeUndefined();
    await create.trigger('click');
    await flushPromises();

    expect(api.saveProductionContract).toHaveBeenCalledTimes(1);
    const [projectId, draft, overwrite] =
      api.saveProductionContract.mock.calls[0]!;
    expect(projectId).toBe('p1');
    expect(draft).toMatchObject({
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
    });
    expect(draft.commands).toEqual(
      expect.arrayContaining(['status', 'check', 'deploy', 'verify']),
    );
    expect(overwrite).toBe(false);
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('pede confirmação antes de substituir um contrato existente', async () => {
    api.saveProductionContract
      .mockRejectedValueOnce(
        new Error(
          'Este projeto já tem um contrato de produção. Confirme a substituição.',
        ),
      )
      .mockResolvedValueOnce(preview(true));
    const wrapper = mountWizard();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Criar contrato'))!
      .trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Substituir o arquivo atual?');
    expect(wrapper.emitted('saved')).toBeUndefined();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Substituir contrato'))!
      .trigger('click');
    await flushPromises();

    expect(api.saveProductionContract.mock.calls[1]?.[2]).toBe(true);
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
});
