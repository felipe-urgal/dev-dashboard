import type { Ref } from 'vue';

import type {
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import {
  fetchDatabaseExplorerTables,
  previewDatabaseExplorerTable,
  queryDatabaseExplorer,
} from '../api/database-explorer';
import { formatDatabaseExplorerError } from '../api/database-explorer-errors';

interface UseDatabaseQueryExecutionOptions {
  sessionId: Ref<string | null>;
  database: Ref<string>;
  table: Ref<string>;
  tables: Ref<MachineDatabaseTable[]>;
  query: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string>;
  resetTableList: () => void;
  resetQuery: () => void;
  setResult: (result: MachineDatabaseQueryResult | null) => void;
  setDuration: (durationMs: number | null) => void;
  resetResultPresentation: () => void;
  clearCopiedMessage: () => void;
  rememberQuery: () => void;
  handleSessionError: (error: unknown) => boolean;
}

function buildTableQuery(table: MachineDatabaseTable): string {
  const qualifiedName = table.schema
    ? `${table.schema}.${table.name}`
    : table.name;
  return `SELECT * FROM ${qualifiedName}`;
}

export function useDatabaseQueryExecution(
  options: UseDatabaseQueryExecutionOptions,
) {
  let operationGeneration = 0;

  function isCurrent(generation: number, expectedSessionId: string): boolean {
    return (
      generation === operationGeneration &&
      options.sessionId.value === expectedSessionId
    );
  }

  function beginOperation(): number {
    operationGeneration += 1;
    options.loading.value = true;
    options.error.value = '';
    return operationGeneration;
  }

  function finishOperation(generation: number): void {
    if (generation === operationGeneration) options.loading.value = false;
  }

  async function selectDatabase(database: string): Promise<void> {
    const expectedSessionId = options.sessionId.value;
    if (!expectedSessionId) return;

    options.database.value = database;
    options.table.value = '';
    options.resetTableList();
    options.setResult(null);
    options.setDuration(null);
    options.resetQuery();

    const generation = beginOperation();
    try {
      const tables = await fetchDatabaseExplorerTables(
        expectedSessionId,
        database || undefined,
      );
      if (isCurrent(generation, expectedSessionId)) {
        options.tables.value = tables;
      }
    } catch (error) {
      if (
        isCurrent(generation, expectedSessionId) &&
        !options.handleSessionError(error)
      ) {
        options.error.value = formatDatabaseExplorerError(
          error,
          'Não foi possível listar as tabelas.',
        );
      }
    } finally {
      finishOperation(generation);
    }
  }

  function selectTable(table: MachineDatabaseTable): void {
    options.table.value = table.name;
    options.query.value = buildTableQuery(table);
    void previewTable();
  }

  async function previewTable(): Promise<void> {
    const expectedSessionId = options.sessionId.value;
    if (!expectedSessionId) return;
    const table = options.tables.value.find(
      (item) => item.name === options.table.value,
    );
    if (!table) return;

    options.query.value = buildTableQuery(table);
    options.resetResultPresentation();
    const generation = beginOperation();
    const startedAt = performance.now();

    try {
      const result = await previewDatabaseExplorerTable(
        expectedSessionId,
        table,
        options.database.value || undefined,
      );
      if (isCurrent(generation, expectedSessionId)) options.setResult(result);
    } catch (error) {
      if (
        isCurrent(generation, expectedSessionId) &&
        !options.handleSessionError(error)
      ) {
        options.error.value = formatDatabaseExplorerError(
          error,
          'Não foi possível consultar a tabela.',
        );
      }
    } finally {
      if (isCurrent(generation, expectedSessionId)) {
        options.setDuration(Math.round(performance.now() - startedAt));
      }
      finishOperation(generation);
    }
  }

  async function runQuery(): Promise<void> {
    const expectedSessionId = options.sessionId.value;
    if (!expectedSessionId) return;
    if (!options.query.value.trim()) {
      options.error.value = 'Informe uma consulta SELECT ou WITH.';
      return;
    }

    options.clearCopiedMessage();
    const generation = beginOperation();
    const startedAt = performance.now();

    try {
      const result = await queryDatabaseExplorer(
        expectedSessionId,
        options.query.value,
        options.database.value || undefined,
      );
      if (isCurrent(generation, expectedSessionId)) {
        options.setResult(result);
        options.rememberQuery();
      }
    } catch (error) {
      if (
        isCurrent(generation, expectedSessionId) &&
        !options.handleSessionError(error)
      ) {
        options.error.value = formatDatabaseExplorerError(
          error,
          'Não foi possível executar a consulta.',
        );
      }
    } finally {
      if (isCurrent(generation, expectedSessionId)) {
        options.setDuration(Math.round(performance.now() - startedAt));
      }
      finishOperation(generation);
    }
  }

  function invalidate(): void {
    operationGeneration += 1;
    options.loading.value = false;
  }

  return {
    selectDatabase,
    selectTable,
    previewTable,
    runQuery,
    invalidate,
  };
}
