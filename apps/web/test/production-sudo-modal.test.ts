import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  authorizeDeploymentSudo: vi.fn(),
  fetchDeploymentSudoStatus: vi.fn(),
}));

vi.mock('../src/api', () => api);

import { ApiRequestError } from '../src/api/core';
import ProductionSudoModal from '../src/components/ProductionSudoModal.vue';

describe('ProductionSudoModal', () => {
  it('interrompe tentativas de senha quando o ticket sudo não é delegável', async () => {
    api.fetchDeploymentSudoStatus.mockReset();
    api.authorizeDeploymentSudo.mockReset();
    api.fetchDeploymentSudoStatus.mockResolvedValue({
      available: true,
      authorized: false,
    });
    api.authorizeDeploymentSudo.mockRejectedValue(
      new ApiRequestError({
        status: 409,
        code: 'DEPLOYMENT_SUDO_TICKET_NOT_DELEGATED',
        message:
          'A senha foi aceita, mas o ticket sudo não pode ser reutilizado. Configure NOPASSWD limitado e gere um novo plano.',
      }),
    );

    const wrapper = mount(ProductionSudoModal, {
      props: { open: false, projectId: 'project-1' },
      global: { stubs: { Teleport: true } },
    });

    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(api.fetchDeploymentSudoStatus).toHaveBeenCalledWith('project-1');
    const input = wrapper.get('input[type="password"]');
    await input.setValue('senha-local');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.authorizeDeploymentSudo).toHaveBeenCalledWith(
      'project-1',
      'senha-local',
    );
    expect(wrapper.text()).toContain('Configurar privilégio mínimo');
    expect(wrapper.text()).toContain('Não adianta repetir a senha');
    expect(wrapper.text()).toContain('NOPASSWD');
    expect(wrapper.text()).toContain('Preparar deployment');
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().includes('Autorizar sudo')),
    ).toBe(false);
    expect(wrapper.text()).toContain('Fechar');

    wrapper.unmount();
  });
});
