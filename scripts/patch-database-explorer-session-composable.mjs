import { readFile, writeFile } from 'node:fs/promises';

const path = 'apps/web/src/views/DatabaseView.vue';
let source = await readFile(path, 'utf8');

function replaceExact(before, after) {
  if (!source.includes(before)) {
    throw new Error(`Trecho esperado não encontrado: ${before.slice(0, 120)}`);
  }
  source = source.replace(before, after);
}

replaceExact(
  `import { computed, onMounted, onUnmounted, ref } from 'vue';`,
  `import { computed, onMounted, ref } from 'vue';`,
);

replaceExact(
  `import {\n  fetchMachineDatabaseServices,\n  fetchMachineDatabaseServiceDetails,\n  fetchMachineDatabaseCatalog,\n  fetchMachineDatabaseTables,\n  previewMachineDatabaseTable,\n  queryMachineDatabase,\n  installMachineDatabaseService,\n  runMachineDatabaseServiceAction,\n  uninstallMachineDatabaseService,\n} from '../api/rails';\nimport { formatDatabaseExplorerError } from '../api/database-explorer-errors';\nimport { confirmDialog } from '../stores/app-dialog';`,
  `import {\n  fetchMachineDatabaseServices,\n  fetchMachineDatabaseServiceDetails,\n  installMachineDatabaseService,\n  runMachineDatabaseServiceAction,\n  uninstallMachineDatabaseService,\n} from '../api/rails';\nimport {\n  fetchDatabaseExplorerTables,\n  previewDatabaseExplorerTable,\n  queryDatabaseExplorer,\n} from '../api/database-explorer';\nimport { formatDatabaseExplorerError } from '../api/database-explorer-errors';\nimport { useDatabaseExplorerSession } from '../composables/useDatabaseExplorerSession';\nimport { confirmDialog } from '../stores/app-dialog';`,
);

replaceExact(
  `const explorerConnection = ref<MachineDatabaseConnection | null>(null);\n`,
  ``,
);

replaceExact(
  `const explorerQueryDurationMs = ref<number | null>(null);\nconst EXPLORER_SESSION_TTL_MS = 15 * 60 * 1000;\nlet explorerSessionTimer: ReturnType<typeof setTimeout> | null = null;`,
  `const explorerQueryDurationMs = ref<number | null>(null);\nconst {\n  sessionId: explorerSessionId,\n  connection: explorerConnection,\n  connect: connectExplorerSession,\n  testConnection: testExplorerSessionConnection,\n  disconnect: disconnectExplorerSession,\n  handleSessionError: handleExplorerSessionError,\n} = useDatabaseExplorerSession({\n  onExpired: () => clearExplorerData(true),\n});`,
);

replaceExact(
  `function clearExplorerSession(showExpiryMessage = false): void {\n  if (explorerSessionTimer) clearTimeout(explorerSessionTimer);\n  explorerSessionTimer = null;\n  const hadConnection = explorerConnection.value !== null;\n  explorerConnection.value = null;`,
  `function clearExplorerData(showExpiryMessage = false): void {`,
);
replaceExact(
  `  if (showExpiryMessage && hadConnection) {`,
  `  if (showExpiryMessage) {`,
);

replaceExact(
  `function disconnectExplorer(): void {\n  clearExplorerSession();\n  explorerError.value = '';\n}\n\nfunction scheduleExplorerSessionExpiry(): void {\n  if (explorerSessionTimer) clearTimeout(explorerSessionTimer);\n  explorerSessionTimer = setTimeout(\n    () => clearExplorerSession(true),\n    EXPLORER_SESSION_TTL_MS,\n  );\n}`,
  `async function disconnectExplorer(): Promise<void> {\n  if (explorerLoading.value) return;\n  explorerLoading.value = true;\n  explorerError.value = '';\n  try {\n    await disconnectExplorerSession();\n    clearExplorerData();\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível encerrar a sessão do banco.',\n    );\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
);

replaceExact(
  `async function connectExplorer(): Promise<void> {\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerTestMessage.value = '';\n  explorerResult.value = null;\n  try {\n    const connection = { ...explorerDraft.value };\n    explorerDatabases.value = await fetchMachineDatabaseCatalog(connection);\n    explorerConnection.value = connection;\n    explorerDatabase.value = '';\n    explorerTable.value = '';\n    explorerTables.value = [];\n    explorerTableSearch.value = '';\n    explorerTablePage.value = 1;\n    explorerQueryDurationMs.value = null;\n    explorerResultSearch.value = '';\n    explorerResultSort.value = null;\n    explorerCopiedMessage.value = '';\n    explorerDraft.value = connectionDraftWithoutSecret(connection);\n    resetExplorerQuery();\n    scheduleExplorerSessionExpiry();\n    explorerModalOpen.value = false;\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível conectar ao banco.',\n    );\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
  `async function connectExplorer(): Promise<void> {\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerTestMessage.value = '';\n  explorerResult.value = null;\n  try {\n    const connection = { ...explorerDraft.value };\n    explorerDatabases.value = await connectExplorerSession(connection);\n    explorerDatabase.value = '';\n    explorerTable.value = '';\n    explorerTables.value = [];\n    explorerTableSearch.value = '';\n    explorerTablePage.value = 1;\n    explorerQueryDurationMs.value = null;\n    explorerResultSearch.value = '';\n    explorerResultSort.value = null;\n    explorerCopiedMessage.value = '';\n    explorerDraft.value = connectionDraftWithoutSecret(connection);\n    resetExplorerQuery();\n    explorerModalOpen.value = false;\n  } catch (error) {\n    if (!handleExplorerSessionError(error)) {\n      explorerError.value = formatDatabaseExplorerError(\n        error,\n        'Não foi possível conectar ao banco.',\n      );\n    }\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
);

replaceExact(
  `async function selectExplorerDatabase(database: string): Promise<void> {\n  if (!explorerConnection.value) return;\n  explorerDatabase.value = database;\n  explorerTable.value = '';\n  explorerTableSearch.value = '';\n  explorerTablePage.value = 1;\n  explorerResult.value = null;\n  explorerQueryDurationMs.value = null;\n  resetExplorerQuery();\n  scheduleExplorerSessionExpiry();\n  explorerLoading.value = true;\n  explorerError.value = '';\n  try {\n    explorerTables.value = await fetchMachineDatabaseTables({\n      ...explorerConnection.value,\n      ...(database ? { database } : {}),\n    });\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível listar as tabelas.',\n    );\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
  `async function selectExplorerDatabase(database: string): Promise<void> {\n  const sessionId = explorerSessionId.value;\n  if (!sessionId) return;\n  explorerDatabase.value = database;\n  explorerTable.value = '';\n  explorerTableSearch.value = '';\n  explorerTablePage.value = 1;\n  explorerResult.value = null;\n  explorerQueryDurationMs.value = null;\n  resetExplorerQuery();\n  explorerLoading.value = true;\n  explorerError.value = '';\n  try {\n    const tables = await fetchDatabaseExplorerTables(\n      sessionId,\n      database || undefined,\n    );\n    if (explorerSessionId.value === sessionId) explorerTables.value = tables;\n  } catch (error) {\n    if (!handleExplorerSessionError(error)) {\n      explorerError.value = formatDatabaseExplorerError(\n        error,\n        'Não foi possível listar as tabelas.',\n      );\n    }\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
);

replaceExact(
  `async function previewExplorerTable(): Promise<void> {\n  if (!explorerConnection.value) return;\n  const table = explorerTables.value.find(\n    (item) => item.name === explorerTable.value,\n  );\n  if (!table) return;\n  explorerQuery.value = buildExplorerTableQuery(table);\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerResultSearch.value = '';\n  explorerResultSort.value = null;\n  explorerCopiedMessage.value = '';\n  scheduleExplorerSessionExpiry();\n  const startedAt = performance.now();\n  try {\n    explorerResult.value = await previewMachineDatabaseTable(\n      {\n        ...explorerConnection.value,\n        ...(explorerDatabase.value ? { database: explorerDatabase.value } : {}),\n      },\n      table,\n    );\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível consultar a tabela.',\n    );\n  } finally {\n    explorerQueryDurationMs.value = Math.round(performance.now() - startedAt);\n    explorerLoading.value = false;\n  }\n}`,
  `async function previewExplorerTable(): Promise<void> {\n  const sessionId = explorerSessionId.value;\n  if (!sessionId) return;\n  const table = explorerTables.value.find(\n    (item) => item.name === explorerTable.value,\n  );\n  if (!table) return;\n  explorerQuery.value = buildExplorerTableQuery(table);\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerResultSearch.value = '';\n  explorerResultSort.value = null;\n  explorerCopiedMessage.value = '';\n  const startedAt = performance.now();\n  try {\n    const result = await previewDatabaseExplorerTable(\n      sessionId,\n      table,\n      explorerDatabase.value || undefined,\n    );\n    if (explorerSessionId.value === sessionId) explorerResult.value = result;\n  } catch (error) {\n    if (!handleExplorerSessionError(error)) {\n      explorerError.value = formatDatabaseExplorerError(\n        error,\n        'Não foi possível consultar a tabela.',\n      );\n    }\n  } finally {\n    if (explorerSessionId.value === sessionId) {\n      explorerQueryDurationMs.value = Math.round(performance.now() - startedAt);\n    }\n    explorerLoading.value = false;\n  }\n}`,
);

replaceExact(
  `async function runExplorerQuery(): Promise<void> {\n  if (!explorerConnection.value) return;\n  if (!explorerQuery.value.trim()) {\n    explorerError.value = 'Informe uma consulta SELECT ou WITH.';\n    return;\n  }\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerCopiedMessage.value = '';\n  scheduleExplorerSessionExpiry();\n  const startedAt = performance.now();\n  try {\n    explorerResult.value = await queryMachineDatabase(\n      {\n        ...explorerConnection.value,\n        ...(explorerDatabase.value ? { database: explorerDatabase.value } : {}),\n      },\n      explorerQuery.value,\n    );\n    rememberExplorerQuery();\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível executar a consulta.',\n    );\n  } finally {\n    explorerQueryDurationMs.value = Math.round(performance.now() - startedAt);\n    explorerLoading.value = false;\n  }\n}`,
  `async function runExplorerQuery(): Promise<void> {\n  const sessionId = explorerSessionId.value;\n  if (!sessionId) return;\n  if (!explorerQuery.value.trim()) {\n    explorerError.value = 'Informe uma consulta SELECT ou WITH.';\n    return;\n  }\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerCopiedMessage.value = '';\n  const startedAt = performance.now();\n  try {\n    const result = await queryDatabaseExplorer(\n      sessionId,\n      explorerQuery.value,\n      explorerDatabase.value || undefined,\n    );\n    if (explorerSessionId.value === sessionId) {\n      explorerResult.value = result;\n      rememberExplorerQuery();\n    }\n  } catch (error) {\n    if (!handleExplorerSessionError(error)) {\n      explorerError.value = formatDatabaseExplorerError(\n        error,\n        'Não foi possível executar a consulta.',\n      );\n    }\n  } finally {\n    if (explorerSessionId.value === sessionId) {\n      explorerQueryDurationMs.value = Math.round(performance.now() - startedAt);\n    }\n    explorerLoading.value = false;\n  }\n}`,
);

replaceExact(
  `async function testExplorerConnection(): Promise<void> {\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerTestMessage.value = '';\n  try {\n    const databases = await fetchMachineDatabaseCatalog({\n      ...explorerDraft.value,\n    });\n    explorerTestMessage.value = \`Conexão validada. \${databases.length} banco(s) encontrado(s).\`;\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível testar a conexão.',\n    );\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
  `async function testExplorerConnection(): Promise<void> {\n  explorerLoading.value = true;\n  explorerError.value = '';\n  explorerTestMessage.value = '';\n  try {\n    const databases = await testExplorerSessionConnection({\n      ...explorerDraft.value,\n    });\n    explorerTestMessage.value = \`Conexão validada. \${databases.length} banco(s) encontrado(s).\`;\n  } catch (error) {\n    explorerError.value = formatDatabaseExplorerError(\n      error,\n      'Não foi possível testar a conexão.',\n    );\n  } finally {\n    explorerLoading.value = false;\n  }\n}`,
);

replaceExact(
  `onMounted(() => {\n  loadSavedConnections();\n  loadExplorerQueryHistory();\n  void loadServices();\n});\nonUnmounted(() => {\n  if (explorerSessionTimer) clearTimeout(explorerSessionTimer);\n});`,
  `onMounted(() => {\n  loadSavedConnections();\n  loadExplorerQueryHistory();\n  void loadServices();\n});`,
);

await writeFile(path, source);
