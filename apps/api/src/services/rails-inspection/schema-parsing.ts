import type {
  RailsSchemaColumn,
  RailsSchemaForeignKey,
  RailsSchemaIndex,
  RailsSchemaTable,
} from '@dev-dashboard/contracts';

function readOption(options: string, name: string): string | undefined {
  const expression = new RegExp(`(?:^|,\\s*)${name}:\\s*(.+?)(?=,\\s*[a-zA-Z_]+:|$)`);
  return options.match(expression)?.[1]?.trim();
}

function readStringOption(options: string, name: string): string | undefined {
  const value = readOption(options, name);
  if (!value) return undefined;
  return value.replace(/^:["']?/, '').replace(/["']$/, '');
}

function readNumberOption(options: string, name: string): number | undefined {
  const value = readOption(options, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function singularize(table: string): string {
  if (table.endsWith('ies')) return `${table.slice(0, -3)}y`;
  if (table.endsWith('ses')) return table.slice(0, -2);
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
}

function parseQuotedList(value: string): string[] {
  return [...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1] ?? '').filter(Boolean);
}

export function parseSchema(source: string): RailsSchemaTable[] {
  const tables: RailsSchemaTable[] = [];
  const foreignKeys: RailsSchemaForeignKey[] = [];
  let current: RailsSchemaTable | null = null;

  for (const line of source.split(/\r?\n/)) {
    const createMatch = line.match(/^\s*create_table\s+["']([^"']+)["'](.*?)do\s+\|t\|\s*$/);
    if (createMatch) {
      const [, tableName = '', options = ''] = createMatch;
      current = { name: tableName, columns: [], indexes: [], foreignKeys: [] };
      if (!/\bid:\s*false\b/.test(options)) {
        const idType = readStringOption(options, 'id') ?? 'bigint';
        current.columns.push({ name: 'id', type: idType, nullable: false, primaryKey: true });
      }
      tables.push(current);
      continue;
    }

    if (current && /^\s*end\s*$/.test(line)) {
      current = null;
      continue;
    }

    if (current) {
      const indexMatch = line.match(/^\s*t\.index\s+\[([^\]]*)\](.*)$/);
      if (indexMatch) {
        const [, rawColumns = '', options = ''] = indexMatch;
        const index: RailsSchemaIndex = {
          columns: parseQuotedList(rawColumns),
          unique: /\bunique:\s*true\b/.test(options),
        };
        const name = readStringOption(options, 'name');
        if (name) index.name = name;
        current.indexes.push(index);
        continue;
      }

      const columnMatch = line.match(/^\s*t\.(\w+)\s+["']([^"']+)["'](.*)$/);
      if (columnMatch) {
        const [, method = 'string', rawName = '', options = ''] = columnMatch;
        const reference = method === 'references' || method === 'belongs_to';
        const column: RailsSchemaColumn = {
          name: reference ? `${rawName}_id` : rawName,
          type: reference ? 'bigint' : method,
          nullable: !/\bnull:\s*false\b/.test(options),
          primaryKey: false,
        };
        const defaultValue = readOption(options, 'default');
        const limit = readNumberOption(options, 'limit');
        const precision = readNumberOption(options, 'precision');
        const scale = readNumberOption(options, 'scale');
        if (defaultValue !== undefined) column.default = defaultValue;
        if (limit !== undefined) column.limit = limit;
        if (precision !== undefined) column.precision = precision;
        if (scale !== undefined) column.scale = scale;
        current.columns.push(column);
        continue;
      }
    }

    const foreignKeyMatch = line.match(/^\s*add_foreign_key\s+["']([^"']+)["']\s*,\s*["']([^"']+)["'](.*)$/);
    if (foreignKeyMatch) {
      const [, fromTable = '', toTable = '', options = ''] = foreignKeyMatch;
      const relation: RailsSchemaForeignKey = {
        fromTable,
        toTable,
        column: readStringOption(options, 'column') ?? `${singularize(toTable)}_id`,
      };
      const primaryKey = readStringOption(options, 'primary_key');
      const name = readStringOption(options, 'name');
      if (primaryKey) relation.primaryKey = primaryKey;
      if (name) relation.name = name;
      foreignKeys.push(relation);
    }
  }

  for (const relation of foreignKeys) {
    tables.find((table) => table.name === relation.fromTable)?.foreignKeys.push(relation);
  }

  return tables;
}
