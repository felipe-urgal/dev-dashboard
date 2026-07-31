import { cleanIdentifier, unique } from './text-helpers';

export function extractMainTable(statement: string): string | undefined {
  const patterns = [
    /\bFROM\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
    /\bUPDATE\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
    /\bINSERT\s+INTO\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
    /\bDELETE\s+FROM\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
  ];

  for (const pattern of patterns) {
    const table = cleanIdentifier(statement.match(pattern)?.[1]);
    if (table) return table;
  }

  return undefined;
}

export function extractJoinedTables(statement: string): string[] {
  const tables: string[] = [];
  const pattern = /\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/gi;

  for (const match of statement.matchAll(pattern)) {
    const table = cleanIdentifier(match[1]);
    if (table) tables.push(table);
  }

  return unique(tables);
}

export function extractLimit(statement: string): number | undefined {
  const value = statement.match(/\bLIMIT\s+(\d+)/i)?.[1];
  return value ? Number(value) : undefined;
}

export function extractOrder(statement: string): string | undefined {
  const match = statement.match(
    /\bORDER\s+BY\s+(.+?)(?=\s+LIMIT\b|\s+OFFSET\b|$)/i,
  );
  if (!match?.[1]) return undefined;

  return match[1]
    .replace(/`/g, '')
    .replace(/\s+ASC\b/gi, ' em ordem crescente')
    .replace(/\s+DESC\b/gi, ' em ordem decrescente')
    .trim();
}

export function selectProjection(statement: string): string {
  return statement.match(/^SELECT\s+(.+?)\s+FROM\b/is)?.[1]?.trim() ?? '*';
}

export function hasSoftDeleteFilter(statement: string): boolean {
  return /\bdeleted_at\b\s+IS\s+NULL/i.test(statement);
}

export function hasWhere(statement: string): boolean {
  return /\bWHERE\b/i.test(statement);
}
