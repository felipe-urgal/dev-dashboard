import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export interface DatabaseExplorerSession {
  sessionId: string;
  expiresAt: string;
}

interface DatabaseExplorerCatalogResponse {
  databases: MachineDatabaseCatalogItem[];
}

interface DatabaseExplorerTablesResponse {
  tables: MachineDatabaseTable[];
}

interface DatabaseExplorerQueryResponse {
  result: MachineDatabaseQueryResult;
}

function sessionBody(sessionId: string, database?: string) {
  return {
    sessionId,
    ...(database ? { database } : {}),
  };
}

export async function createDatabaseExplorerSession(
  connection: MachineDatabaseConnection,
): Promise<DatabaseExplorerSession> {
  return await requestJson<DatabaseExplorerSession>(
    '/api/database/explorer/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
    },
  );
}

export async function deleteDatabaseExplorerSession(
  sessionId: string,
): Promise<void> {
  await requestJson(
    `/api/database/explorer/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

export async function fetchDatabaseExplorerCatalog(
  sessionId: string,
): Promise<MachineDatabaseCatalogItem[]> {
  const response = await requestJson<DatabaseExplorerCatalogResponse>(
    '/api/database/explorer/sessions/catalog',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionBody(sessionId)),
    },
  );
  return response.databases;
}

export async function fetchDatabaseExplorerTables(
  sessionId: string,
  database?: string,
): Promise<MachineDatabaseTable[]> {
  const response = await requestJson<DatabaseExplorerTablesResponse>(
    '/api/database/explorer/sessions/tables',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionBody(sessionId, database)),
    },
  );
  return response.tables;
}

export async function previewDatabaseExplorerTable(
  sessionId: string,
  table: MachineDatabaseTable,
  database?: string,
): Promise<MachineDatabaseQueryResult> {
  const response = await requestJson<DatabaseExplorerQueryResponse>(
    '/api/database/explorer/sessions/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionBody(sessionId, database),
        table: table.name,
        ...(table.schema ? { schema: table.schema } : {}),
      }),
    },
  );
  return response.result;
}

export async function queryDatabaseExplorer(
  sessionId: string,
  query: string,
  database?: string,
): Promise<MachineDatabaseQueryResult> {
  const response = await requestJson<DatabaseExplorerQueryResponse>(
    '/api/database/explorer/sessions/query',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionBody(sessionId, database),
        query,
      }),
    },
  );
  return response.result;
}
