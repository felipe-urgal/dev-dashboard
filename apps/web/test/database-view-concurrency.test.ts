import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('DatabaseView concorrência do Explorer', () => {
  it('bloqueia troca de conexão, banco e tabela enquanto uma leitura está em voo', async () => {
    api.fetchMachineDatabaseServices.mockResolvedValue([]);
    api.fetchMachineDatabaseCatalog.mockResolvedValue([
      { name: 'app_development' },
    ]);

    const tables = deferred<MachineDatabaseTable[]>();
    api.fetchMachineDatabaseTables.mockReturnValueOnce(tables.promise);

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

    const databaseSelect = wrapper.get('.database-explorer-select-label select');
    await databaseSelect.setValue('app_development');

    expect(databaseSelect.attributes('disabled')).toBeDefined();
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text().trim() === 'Trocar conexão')!
        .attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text().trim() === 'Desconectar')!
        .attributes('disabled'),
    ).toBeDefined();

    tables.resolve([{ schema: 'public', name: 'users' }]);
    await flushPromises();

    expect(databaseSelect.attributes('disabled')).toBeUndefined();

    const preview = deferred<MachineDatabaseQueryResult>();
    api.previewMachineDatabaseTable.mockReturnValueOnce(preview.promise);
    const tableButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'public.users')!;

    await tableButton.trigger('click');

    expect(tableButton.attributes('disabled')).toBeDefined();
    expect(databaseSelect.attributes('disabled')).toBeDefined();

    preview.resolve({
      columns: ['id'],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
    });
    await flushPromises();

    expect(databaseSelect.attributes('disabled')).toBeUndefined();
  });
});
