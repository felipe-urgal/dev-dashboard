import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, mutate) {
  const source = await readFile(path, 'utf8');
  const next = mutate(source);
  if (next === source) throw new Error(`Nenhuma alteração aplicada em ${path}`);
  await writeFile(path, next);
}

function exact(source, before, after) {
  if (!source.includes(before)) {
    throw new Error(`Trecho esperado não encontrado: ${before.slice(0, 120)}`);
  }
  return source.replace(before, after);
}

await patch('apps/web/test/database-view.test.ts', (input) => {
  let source = input;
  source = exact(
    source,
    `const api = vi.hoisted(() => ({\n  fetchMachineDatabaseServices: vi.fn(),\n  fetchMachineDatabaseServiceDetails: vi.fn(),\n  fetchMachineDatabaseCatalog: vi.fn(),\n  fetchMachineDatabaseTables: vi.fn(),\n  previewMachineDatabaseTable: vi.fn(),\n  queryMachineDatabase: vi.fn(),\n  installMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n  runMachineDatabaseServiceAction: vi.fn().mockResolvedValue(undefined),\n  uninstallMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n}));`,
    `const api = vi.hoisted(() => ({\n  fetchMachineDatabaseServices: vi.fn(),\n  fetchMachineDatabaseServiceDetails: vi.fn(),\n  installMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n  runMachineDatabaseServiceAction: vi.fn().mockResolvedValue(undefined),\n  uninstallMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n}));\nconst explorerApi = vi.hoisted(() => ({\n  createDatabaseExplorerSession: vi.fn(),\n  deleteDatabaseExplorerSession: vi.fn().mockResolvedValue(undefined),\n  fetchDatabaseExplorerCatalog: vi.fn(),\n  fetchDatabaseExplorerTables: vi.fn(),\n  previewDatabaseExplorerTable: vi.fn(),\n  queryDatabaseExplorer: vi.fn(),\n}));`,
  );
  source = exact(
    source,
    `vi.mock('../src/api/rails', () => api);\nvi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));`,
    `vi.mock('../src/api/rails', () => api);\nvi.mock('../src/api/database-explorer', () => explorerApi);\nvi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));`,
  );
  source = exact(
    source,
    `    api.fetchMachineDatabaseServices.mockResolvedValue([]);\n    api.fetchMachineDatabaseCatalog.mockResolvedValue([\n      { name: 'app_development' },\n    ]);\n    api.fetchMachineDatabaseTables.mockResolvedValue([\n      { schema: 'public', name: 'users' },\n    ]);`,
    `    api.fetchMachineDatabaseServices.mockResolvedValue([]);\n    explorerApi.createDatabaseExplorerSession.mockResolvedValue({\n      sessionId: 'session-1',\n      expiresAt: new Date(Date.now() + 60_000).toISOString(),\n    });\n    explorerApi.fetchDatabaseExplorerCatalog.mockResolvedValue([\n      { name: 'app_development' },\n    ]);\n    explorerApi.fetchDatabaseExplorerTables.mockResolvedValue([\n      { schema: 'public', name: 'users' },\n    ]);`,
  );
  source = exact(
    source,
    `    api.previewMachineDatabaseTable.mockResolvedValue(result);\n    api.queryMachineDatabase.mockResolvedValue(result);`,
    `    explorerApi.previewDatabaseExplorerTable.mockResolvedValue(result);\n    explorerApi.queryDatabaseExplorer.mockResolvedValue(result);`,
  );
  source = exact(
    source,
    `    expect(api.fetchMachineDatabaseCatalog).toHaveBeenCalled();`,
    `    expect(explorerApi.createDatabaseExplorerSession).toHaveBeenCalled();\n    expect(explorerApi.fetchDatabaseExplorerCatalog).toHaveBeenCalledWith(\n      'session-1',\n    );`,
  );
  source = exact(
    source,
    `    expect(api.queryMachineDatabase).toHaveBeenCalled();`,
    `    expect(explorerApi.queryDatabaseExplorer).toHaveBeenCalledWith(\n      'session-1',\n      expect.any(String),\n      'app_development',\n    );`,
  );
  source = exact(
    source,
    `    await wrapper\n      .findAll('button')\n      .find((button) => button.text().trim() === 'Desconectar')!\n      .trigger('click');\n    expect(wrapper.text()).toContain('Nenhuma conexão ativa');`,
    `    await wrapper\n      .findAll('button')\n      .find((button) => button.text().trim() === 'Desconectar')!\n      .trigger('click');\n    await flushPromises();\n    expect(explorerApi.deleteDatabaseExplorerSession).toHaveBeenCalledWith(\n      'session-1',\n    );\n    expect(wrapper.text()).toContain('Nenhuma conexão ativa');`,
  );
  return source;
});

await patch('apps/web/test/database-view-concurrency.test.ts', (input) => {
  let source = input;
  source = exact(
    source,
    `const api = vi.hoisted(() => ({\n  fetchMachineDatabaseServices: vi.fn(),\n  fetchMachineDatabaseServiceDetails: vi.fn(),\n  fetchMachineDatabaseCatalog: vi.fn(),\n  fetchMachineDatabaseTables: vi.fn(),\n  previewMachineDatabaseTable: vi.fn(),\n  queryMachineDatabase: vi.fn(),\n  installMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n  runMachineDatabaseServiceAction: vi.fn().mockResolvedValue(undefined),\n  uninstallMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n}));`,
    `const api = vi.hoisted(() => ({\n  fetchMachineDatabaseServices: vi.fn(),\n  fetchMachineDatabaseServiceDetails: vi.fn(),\n  installMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n  runMachineDatabaseServiceAction: vi.fn().mockResolvedValue(undefined),\n  uninstallMachineDatabaseService: vi.fn().mockResolvedValue(undefined),\n}));\nconst explorerApi = vi.hoisted(() => ({\n  createDatabaseExplorerSession: vi.fn(),\n  deleteDatabaseExplorerSession: vi.fn().mockResolvedValue(undefined),\n  fetchDatabaseExplorerCatalog: vi.fn(),\n  fetchDatabaseExplorerTables: vi.fn(),\n  previewDatabaseExplorerTable: vi.fn(),\n  queryDatabaseExplorer: vi.fn(),\n}));`,
  );
  source = exact(
    source,
    `vi.mock('../src/api/rails', () => api);\nvi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));`,
    `vi.mock('../src/api/rails', () => api);\nvi.mock('../src/api/database-explorer', () => explorerApi);\nvi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));`,
  );
  source = exact(
    source,
    `    api.fetchMachineDatabaseServices.mockResolvedValue([]);\n    api.fetchMachineDatabaseCatalog.mockResolvedValue([\n      { name: 'app_development' },\n    ]);\n\n    const tables = deferred<MachineDatabaseTable[]>();\n    api.fetchMachineDatabaseTables.mockReturnValueOnce(tables.promise);`,
    `    api.fetchMachineDatabaseServices.mockResolvedValue([]);\n    explorerApi.createDatabaseExplorerSession.mockResolvedValue({\n      sessionId: 'session-1',\n      expiresAt: new Date(Date.now() + 60_000).toISOString(),\n    });\n    explorerApi.fetchDatabaseExplorerCatalog.mockResolvedValue([\n      { name: 'app_development' },\n    ]);\n\n    const tables = deferred<MachineDatabaseTable[]>();\n    explorerApi.fetchDatabaseExplorerTables.mockReturnValueOnce(tables.promise);`,
  );
  source = exact(
    source,
    `    api.previewMachineDatabaseTable.mockReturnValueOnce(preview.promise);`,
    `    explorerApi.previewDatabaseExplorerTable.mockReturnValueOnce(\n      preview.promise,\n    );`,
  );
  return source;
});
