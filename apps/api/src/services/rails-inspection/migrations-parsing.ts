import path from 'node:path';

import type { RailsMigrationEntry } from '@dev-dashboard/contracts';

export function migrationsDirectory(projectPath: string, database: string): string {
  return path.join(projectPath, 'db', database === 'primary' ? 'migrate' : `migrate_${database}`);
}

const COMPOSE_PREFIX = String.raw`(?:[^|\r\n]+\|\s*)?`;
const MIGRATION_ROW = new RegExp(
  String.raw`^${COMPOSE_PREFIX}\s*(up|down)\s+(\S+)\s+(.+?)\s*$`,
  'i',
);
const DATABASE_LINE = new RegExp(
  String.raw`^${COMPOSE_PREFIX}\s*database:\s*(.+?)\s*$`,
  'i',
);
const MIGRATION_FILE = /^(\d{8,20})_(.+)\.rb$/;
const ANSI_ESCAPE = /\u001B\[[0-?]*[ -/]*[@-~]/g;

export interface MigrationStatusBlock {
  database?: string;
  migrations: RailsMigrationEntry[];
}

/**
 * `db:migrate:status` imprime um bloco `database: <arquivo>` por banco configurado
 * quando o projeto tem mais de um (Rails 6+). Cada bloco vira uma entrada própria,
 * em vez de misturar as migrations de todos os bancos numa lista só.
 */
export function parseMigrationStatusBlocks(output: string): MigrationStatusBlock[] {
  const blocks: MigrationStatusBlock[] = [];
  let current: MigrationStatusBlock | undefined;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(ANSI_ESCAPE, '');
    const databaseMatch = line.match(DATABASE_LINE);
    if (databaseMatch) {
      current = { database: databaseMatch[1] ?? '', migrations: [] };
      blocks.push(current);
      continue;
    }
    const rowMatch = line.match(MIGRATION_ROW);
    if (!rowMatch) continue;
    if (!current) {
      current = { migrations: [] };
      blocks.push(current);
    }
    const [, status, version, name] = rowMatch;
    current.migrations.push({
      status: (status ?? '').toLowerCase() as RailsMigrationEntry['status'],
      version: version ?? '',
      name: name ?? '',
    });
  }

  return blocks;
}

/**
 * O filesystem é a fonte de verdade para saber quais migrations existem no
 * checkout atual. Sem isso, uma imagem Docker antiga pode esconder arquivos
 * recentes que ainda não foram copiados ou montados no container.
 */
export function parseMigrationFiles(fileNames: string[]): RailsMigrationEntry[] {
  return fileNames.flatMap((fileName) => {
    const match = fileName.match(MIGRATION_FILE);
    if (!match) return [];
    const rawName = match[2] ?? '';
    const normalizedName = rawName.replace(/_+/g, ' ').trim();
    return [{
      version: match[1] ?? '',
      name: normalizedName ? normalizedName[0]!.toUpperCase() + normalizedName.slice(1) : rawName,
      status: 'down' as const,
    }];
  });
}

/**
 * O status consultado no banco prevalece; arquivos ainda ausentes na saída do
 * runtime continuam visíveis como pendentes. Entradas aplicadas cujo arquivo foi
 * removido também são preservadas para diagnóstico.
 */
export function mergeMigrationEntries(
  files: RailsMigrationEntry[],
  status: RailsMigrationEntry[],
): RailsMigrationEntry[] {
  const merged = new Map<string, RailsMigrationEntry>();
  for (const entry of files) merged.set(entry.version, entry);
  for (const entry of status) merged.set(entry.version, entry);
  return [...merged.values()].sort((left, right) => right.version.localeCompare(left.version));
}

/**
 * Correlaciona os blocos de status (identificados pelo arquivo/nome do banco impresso
 * pelo Rails, ex. "app_development_data") com os nomes configurados em database.yml
 * (ex. "data"), pela convenção do próprio Rails de sufixar o banco secundário com o
 * nome da configuração. O que sobra vira "primary".
 */
export function matchMigrationStatusBlock(
  blocks: MigrationStatusBlock[],
  databases: string[],
  database: string,
): MigrationStatusBlock {
  if (database === 'primary') {
    const secondary = databases.filter((name) => name !== 'primary');
    const remaining = blocks.filter((block) =>
      !secondary.some((name) =>
        block.database?.toLowerCase().includes(`_${name}`),
      ),
    );
    return remaining[0] ?? blocks[0] ?? { migrations: [] };
  }
  return blocks.find((block) =>
    block.database?.toLowerCase().includes(`_${database}`),
  ) ?? blocks[0] ?? { migrations: [] };
}
