import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({
  fetchMachineDatabaseServices: vi.fn(),
  fetchMachineDatabaseServiceDetails: vi.fn(),
  installMachineDatabaseService: vi.fn().mockResolvedValue(undefined),
  runMachineDatabaseServiceAction: vi.fn().mockResolvedValue(undefined),
  uninstallMachineDatabaseService: vi.fn().mockResolvedValue(undefined),
}));
const explorerApi = vi.hoisted(() => ({
  createDatabaseExplorerSession: vi.fn(),
  deleteDatabaseExplorerSession: vi.fn().mockResolvedValue(undefined),
  fetchDatabaseExplorerCatalog: vi.fn(),
  fetchDatabaseExplorerTables: vi.fn(),
  previewDatabaseExplorerTable: vi.fn(),
  queryDatabaseExplorer: vi.fn(),
}));
const confirmDialog = vi.hoisted(() => vi.fn());

vi.mock('../src/api/rails', () => api);
vi.mock('../src/api/database-explorer', () => explorerApi);
vi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));

import DatabaseConnectionDialog from '../src/components/database/DatabaseConnectionDialog.vue';
import DatabaseQueryEditor from '../src/components/database/DatabaseQueryEditor.vue';
import DatabaseSidebar from '../src/components/database/DatabaseSidebar.vue';
import DatabaseView from '../src/views/DatabaseView.vue';

const wrappers: VueWrapper[] = [];

const postgres = {
  id: 'postgresql',
  driver: 'postgresql',
  label: 'PostgreSQL',
  unit: 'postgresql.service',
  installed: true,
  active: true,
};

async function mountView(): Promise<VueWrapper> {
  api.fetchMachineDatabaseServiceDetails.mockResolvedValue({
    serviceId: 'postgresql',
    port: 5432,
    reachability: 'reachable',
    logs: [],
  });
  const wrapper = mount(DatabaseView);
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('DatabaseView', () => {
  it('confirma antes de parar ou reiniciar um banco ativo', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([postgres]);
    const wrapper = await mountView();
    const sidebar = wrapper.getComponent(DatabaseSidebar);

    confirmDialog.mockResolvedValue(false);
    sidebar.vm.$emit('run-action', postgres, 'restart');
    await flushPromises();
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reiniciar PostgreSQL?',
        confirmLabel: 'Reiniciar serviço',
      }),
    );
    expect(api.runMachineDatabaseServiceAction).not.toHaveBeenCalled();

    confirmDialog.mockResolvedValue(true);
    sidebar.vm.$emit('run-action', postgres, 'restart');
    await flushPromises();
    expect(api.runMachineDatabaseServiceAction).toHaveBeenCalledWith(
      'postgresql',
      'restart',
    );
  });

  it('exige confirmação antes de desinstalar um serviço', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([postgres]);
    const wrapper = await mountView();
    const sidebar = wrapper.getComponent(DatabaseSidebar);

    confirmDialog.mockResolvedValue(false);
    sidebar.vm.$emit('uninstall', postgres);
    await flushPromises();
    expect(api.uninstallMachineDatabaseService).not.toHaveBeenCalled();

    confirmDialog.mockResolvedValue(true);
    sidebar.vm.$emit('uninstall', postgres);
    await flushPromises();
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Desinstalar PostgreSQL?' }),
    );
    expect(api.uninstallMachineDatabaseService).toHaveBeenCalledWith(
      'postgresql',
    );
  });

  it('explora um serviço, consulta e encerra a sessão ao desconectar', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([postgres]);
    explorerApi.createDatabaseExplorerSession.mockResolvedValue({
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    explorerApi.fetchDatabaseExplorerCatalog.mockResolvedValue([
      { name: 'app_development' },
    ]);
    explorerApi.fetchDatabaseExplorerTables.mockResolvedValue([
      { schema: 'public', name: 'users' },
    ]);
    const result = {
      columns: ['id', 'name'],
      rows: [[1, 'Ana']],
      rowCount: 1,
      truncated: false,
    };
    explorerApi.previewDatabaseExplorerTable.mockResolvedValue(result);
    explorerApi.queryDatabaseExplorer.mockResolvedValue(result);
    const wrapper = await mountView();
    const sidebar = wrapper.getComponent(DatabaseSidebar);

    sidebar.vm.$emit('explore', postgres);
    await flushPromises();
    const dialog = wrapper.getComponent(DatabaseConnectionDialog);
    expect(dialog.props('draft')).toMatchObject({
      driver: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
    });
    dialog.vm.$emit('update:draft', {
      ...dialog.props('draft'),
      username: 'app',
      password: 'segredo',
    });
    await flushPromises();
    dialog.vm.$emit('connect');
    await flushPromises();

    expect(explorerApi.createDatabaseExplorerSession).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'app', password: 'segredo' }),
    );
    // Um único banco já abre direto na lista de tabelas.
    expect(explorerApi.fetchDatabaseExplorerTables).toHaveBeenCalledWith(
      'session-1',
      'app_development',
    );

    wrapper
      .getComponent(DatabaseSidebar)
      .vm.$emit('select-table', { schema: 'public', name: 'users' });
    await flushPromises();
    expect(explorerApi.previewDatabaseExplorerTable).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Ana');

    wrapper.getComponent(DatabaseQueryEditor).vm.$emit('run');
    await flushPromises();
    expect(explorerApi.queryDatabaseExplorer).toHaveBeenCalledWith(
      'session-1',
      expect.any(String),
      'app_development',
    );

    wrapper.getComponent(DatabaseSidebar).vm.$emit('disconnect');
    await flushPromises();
    expect(explorerApi.deleteDatabaseExplorerSession).toHaveBeenCalledWith(
      'session-1',
    );
    expect(wrapper.text()).toContain('Explore seus bancos locais');
  });
});
