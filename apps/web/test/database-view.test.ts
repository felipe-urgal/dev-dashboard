import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({
  fetchMachineDatabaseServices: vi.fn(),
  installMachineDatabaseService: vi.fn().mockResolvedValue(undefined),
  runMachineDatabaseServiceAction: vi.fn().mockResolvedValue(undefined),
  uninstallMachineDatabaseService: vi.fn().mockResolvedValue(undefined),
}));
const confirmDialog = vi.hoisted(() => vi.fn());

vi.mock('../src/api/rails', () => api);
vi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));

import DatabaseView from '../src/views/DatabaseView.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
});

describe('DatabaseView', () => {
  it('confirma antes de parar ou reiniciar um banco ativo', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([
      {
        id: 'postgresql',
        driver: 'postgresql',
        label: 'PostgreSQL',
        unit: 'postgresql.service',
        installed: true,
        active: true,
      },
    ]);
    confirmDialog.mockResolvedValue(false);
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    const restartButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Reiniciar'))!;
    await restartButton.trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reiniciar PostgreSQL?',
        confirmLabel: 'Reiniciar serviço',
      }),
    );
    expect(api.runMachineDatabaseServiceAction).not.toHaveBeenCalled();

    confirmDialog.mockResolvedValue(true);
    await restartButton.trigger('click');
    await flushPromises();
    expect(api.runMachineDatabaseServiceAction).toHaveBeenCalledWith(
      'postgresql',
      'restart',
    );
  });

  it('inicia um serviço parado sem pedir confirmação', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([
      {
        id: 'mysql',
        driver: 'mysql',
        label: 'MySQL',
        unit: 'mysql.service',
        installed: true,
        active: false,
      },
    ]);
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    const startButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Iniciar'))!;
    await startButton.trigger('click');
    await flushPromises();

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(api.runMachineDatabaseServiceAction).toHaveBeenCalledWith(
      'mysql',
      'start',
    );
    expect(api.fetchMachineDatabaseServices).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="status"]').text()).toContain(
      'MySQL iniciado com sucesso.',
    );
  });

  it('exibe a mensagem específica retornada pela API quando uma ação falha', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([
      {
        id: 'mysql',
        driver: 'mysql',
        label: 'MySQL',
        unit: 'mysql.service',
        installed: true,
        active: false,
      },
    ]);
    api.runMachineDatabaseServiceAction.mockRejectedValueOnce(
      new Error('Não é possível iniciar enquanto MariaDB estiver em execução.'),
    );
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Iniciar'))!
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não é possível iniciar enquanto MariaDB estiver em execução.',
    );
  });

  it('separa serviços não instalados e confirma a instalação', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([
      {
        id: 'mongodb',
        driver: 'mongodb',
        label: 'MongoDB',
        unit: 'mongod.service',
        installed: false,
        active: false,
      },
    ]);
    confirmDialog.mockResolvedValue(true);
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.text()).toContain('Disponíveis para instalar');
    const installButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Instalar'))!;
    await installButton.trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Instalar MongoDB?' }),
    );
    expect(api.installMachineDatabaseService).toHaveBeenCalledWith('mongodb');
  });

  it('exige confirmação antes de desinstalar um serviço', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([
      {
        id: 'mysql',
        driver: 'mysql',
        label: 'MySQL',
        unit: 'mysql.service',
        installed: true,
        active: false,
      },
    ]);
    confirmDialog.mockResolvedValue(true);
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    const uninstallButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Desinstalar'))!;
    await uninstallButton.trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Desinstalar MySQL?' }),
    );
    expect(api.uninstallMachineDatabaseService).toHaveBeenCalledWith('mysql');
  });
});
