import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({
  fetchMachineDatabaseServices: vi.fn(),
  fetchMachineDatabaseServiceDetails: vi.fn(),
  fetchMachineDatabaseCatalog: vi.fn(),
  fetchMachineDatabaseTables: vi.fn(),
  previewMachineDatabaseTable: vi.fn(),
  queryMachineDatabase: vi.fn(),
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

  it('carrega detalhes, testa a conexão e mostra logs recentes', async () => {
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
    api.fetchMachineDatabaseServiceDetails.mockResolvedValue({
      serviceId: 'postgresql',
      port: 5432,
      version: 'psql (PostgreSQL) 16.4',
      pid: 4242,
      reachability: 'reachable',
      logs: ['ready to accept connections'],
    });
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Ver detalhes'))!
      .trigger('click');
    await flushPromises();

    expect(api.fetchMachineDatabaseServiceDetails).toHaveBeenCalledWith(
      'postgresql',
    );
    expect(wrapper.text()).toContain('5432');
    expect(wrapper.text()).toContain('psql (PostgreSQL) 16.4');
    expect(wrapper.text()).toContain('Porta acessível');
    expect(wrapper.text()).toContain('ready to accept connections');

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Testar conexão'))!
      .trigger('click');
    await flushPromises();
    expect(api.fetchMachineDatabaseServiceDetails).toHaveBeenCalledTimes(2);
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

  it('conecta, executa consultas e permite filtrar, ordenar, copiar, exportar e desconectar', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([]);
    api.fetchMachineDatabaseCatalog.mockResolvedValue([
      { name: 'app_development' },
    ]);
    api.fetchMachineDatabaseTables.mockResolvedValue([
      { schema: 'public', name: 'users' },
    ]);
    const result = {
      columns: ['id', 'name'],
      rows: [
        [2, 'Bia'],
        [1, 'Ana'],
      ],
      rowCount: 2,
      truncated: false,
    };
    api.previewMachineDatabaseTable.mockResolvedValue(result);
    api.queryMachineDatabase.mockResolvedValue(result);
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboard },
    });
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    const wrapper = mount(DatabaseView);
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Conectar a um serviço'))!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Conectar e continuar'))!
      .trigger('click');
    await flushPromises();

    expect(api.fetchMachineDatabaseCatalog).toHaveBeenCalled();
    await wrapper.get('select').setValue('app_development');
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'public.users')!
      .trigger('click');
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Executar leitura')!
      .trigger('click');
    await flushPromises();
    expect(api.queryMachineDatabase).toHaveBeenCalled();

    expect(wrapper.text()).toContain('Ana');
    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'name')!
      .trigger('click');
    await wrapper
      .get('input[placeholder="Buscar nos resultados"]')
      .setValue('Ana');
    expect(wrapper.text()).toContain('1 de 2 linhas');
    expect(wrapper.text()).toContain('Ana');
    expect(wrapper.text()).not.toContain('Bia');

    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Copiar')!
      .trigger('click');
    await flushPromises();
    expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('Ana'));
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Resultado copiado',
    );

    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'CSV')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'JSON')!
      .trigger('click');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);

    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Histórico')!
      .trigger('click');
    expect(wrapper.text()).toContain('Consultas recentes');
    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Desconectar')!
      .trigger('click');
    expect(wrapper.text()).toContain('Nenhuma conexão ativa');
  });
});
