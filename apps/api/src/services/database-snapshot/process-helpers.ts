import { DatabaseSnapshotError } from './errors.js';

/** Traduz a falha de spawn mais comum: cliente do banco ausente no PATH. */
export function spawnFailure(
  binary: string,
  error: unknown,
): DatabaseSnapshotError {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ENOENT') {
    return new DatabaseSnapshotError(
      'DATABASE_SNAPSHOT_TOOL_MISSING',
      `'${binary}' não está disponível no PATH. Instale o cliente do banco para usar snapshots.`,
    );
  }
  return new DatabaseSnapshotError(
    'DATABASE_SNAPSHOT_FAILED',
    error instanceof Error ? error.message : `Falha ao executar '${binary}'.`,
  );
}

export function normalizeLabel(value: string): string {
  const normalized = value
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'manual';
}
