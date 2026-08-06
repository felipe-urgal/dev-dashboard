import { access, readFile } from 'node:fs/promises';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import net from 'node:net';
import path from 'node:path';

import type {
  DatabaseReachability,
  Project,
  ProjectDatabaseEnvironment,
  ProjectDatabaseOverview,
  ProjectDatabaseSource,
} from '@dev-dashboard/contracts';

export interface DetectedDatabase extends Omit<
  ProjectDatabaseEnvironment,
  'reachability' | 'serviceAvailable'
> {
  databaseUrl?: string;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<void>;

export type DatabaseServiceAction = 'start' | 'stop' | 'restart';
export type DatabaseServiceActionFailureReason =
  | 'systemctl-unavailable'
  | 'authorization-unavailable'
  | 'permission-denied'
  | 'command-failed';

const serviceActionVerbs: Record<DatabaseServiceAction, string> = {
  start: 'iniciar',
  stop: 'parar',
  restart: 'reiniciar',
};

export class DatabaseServiceActionError extends Error {
  public constructor(
    public readonly action: DatabaseServiceAction,
    public readonly reason: DatabaseServiceActionFailureReason,
    options?: ErrorOptions,
  ) {
    super(
      `Falha ao ${serviceActionVerbs[action]} o serviço de banco de dados.`,
      options,
    );
    this.name = 'DatabaseServiceActionError';
  }
}

const execFileAsync = promisify(execFile);
const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
};

function commandFailureText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const failure = error as {
    code?: unknown;
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  return [failure.code, failure.message, failure.stderr, failure.stdout]
    .filter(
      (value): value is string | number =>
        typeof value === 'string' || typeof value === 'number',
    )
    .join(' ')
    .toLowerCase();
}

function serviceActionFailureReason(
  error: unknown,
): DatabaseServiceActionFailureReason {
  const text = commandFailureText(error);
  if (
    text.includes('spawn pkexec enoent') ||
    text.includes('pkexec: command not found')
  )
    return 'authorization-unavailable';
  if (
    text.includes('authentication agent') ||
    text.includes('authentication dialog was dismissed')
  )
    return 'authorization-unavailable';
  if (
    text.includes('permission denied') ||
    text.includes('not permitted') ||
    text.includes('not authorized')
  )
    return 'permission-denied';
  if (
    text.includes('systemctl: command not found') ||
    text.includes('failed to execute systemctl')
  )
    return 'systemctl-unavailable';
  return 'command-failed';
}

const defaultPorts: Record<string, number> = {
  postgres: 5432,
  postgresql: 5432,
  mysql: 3306,
  mysql2: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
};

const systemdServices: Record<string, string> = {
  mariadb: 'mariadb.service',
  mongodb: 'mongod.service',
  mysql: 'mysql.service',
  mysql2: 'mysql.service',
  postgres: 'postgresql.service',
  postgresql: 'postgresql.service',
  redis: 'redis-server.service',
};

function localSystemdService(item: DetectedDatabase): string | null {
  const host = item.host?.toLowerCase().replace(/^\[|\]$/g, '');
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) return null;
  return systemdServices[item.driver.toLowerCase()] ?? null;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function safeRead(
  projectPath: string,
  relative: string,
): Promise<string | null> {
  const target = path.resolve(projectPath, relative);
  const root = path.resolve(projectPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  try {
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}

function parseDotenv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    values[match[1] ?? ''] = value;
  }
  return values;
}

function fromUrl(
  id: string,
  environment: string,
  rawUrl: string,
  source: ProjectDatabaseSource,
  sourceDetail: string,
): DetectedDatabase | null {
  try {
    const url = new URL(rawUrl);
    const driver =
      url.protocol.replace(':', '').split('+')[0] ?? 'desconhecido';
    const port = url.port ? Number(url.port) : defaultPorts[driver];
    const passwordConfigured = url.password.length > 0;
    if (passwordConfigured) url.password = '••••••••';
    return {
      id,
      environment,
      driver,
      ...(url.hostname ? { host: url.hostname } : {}),
      ...(port ? { port } : {}),
      ...(url.pathname.slice(1)
        ? { database: decodeURIComponent(url.pathname.slice(1)) }
        : {}),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      passwordConfigured,
      maskedUrl: url.toString(),
      source,
      sourceDetail,
      databaseUrl: rawUrl,
    };
  } catch {
    return null;
  }
}

function interpolate(value: string, env: Record<string, string>): string {
  return value.replace(
    /<%=\s*ENV(?:\[['"]([^'"]+)['"]\]|\.fetch\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]*)['"])?\s*\))\s*%>/g,
    (
      _all,
      indexedName: string | undefined,
      fetchedName: string | undefined,
      fallback?: string,
    ) => env[indexedName ?? fetchedName ?? ''] ?? fallback ?? '',
  );
}

function collectFields(
  lines: string[],
  minIndent: number,
): Record<string, string> {
  const fields: Record<string, string> = {};
  const pattern = new RegExp(
    `^\\s{${minIndent},}([a-z_]+):\\s*(.*?)\\s*$`,
    'i',
  );
  for (const line of lines) {
    const match = line.match(pattern);
    if (match)
      fields[match[1] ?? ''] = (match[2] ?? '').replace(/^['"]|['"]$/g, '');
  }
  return fields;
}

/**
 * Rails 6+ permite múltiplos bancos por ambiente (`development: { primary: {...}, data: {...} }`).
 * Uma linha de 2 espaços terminada em ":" sem valor é o nome do banco; seus campos ficam a 4+ espaços.
 */
function buildEnvironment(
  section: string,
  databaseName: string | null,
  fields: Record<string, string>,
  defaults: Record<string, string>,
  env: Record<string, string>,
): DetectedDatabase | null {
  const merged = { ...defaults, ...fields };
  const isSecondaryDatabase =
    databaseName !== null && databaseName !== 'primary';
  const environment = isSecondaryDatabase
    ? `${section}/${databaseName}`
    : section;
  const id = isSecondaryDatabase
    ? `rails-${section}-${databaseName}`
    : `rails-${section}`;

  const urlValue = merged.url;
  if (urlValue)
    return fromUrl(
      id,
      environment,
      interpolate(urlValue, env),
      'rails-database-yml',
      'config/database.yml',
    );

  const driver = interpolate(merged.adapter ?? '', env);
  if (!driver) return null;
  const host = interpolate(merged.host ?? 'localhost', env);
  const port =
    Number(interpolate(merged.port ?? '', env)) || defaultPorts[driver];
  const username = interpolate(merged.username ?? '', env);
  const password = interpolate(merged.password ?? '', env);
  const database = interpolate(merged.database ?? '', env);
  const protocol =
    driver === 'postgresql' ? 'postgresql' : driver.replace('2', '');
  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : '';
  const databaseUrl = `${protocol}://${auth}${host}${port ? `:${port}` : ''}/${database}`;
  const maskedUrl = password
    ? databaseUrl.replace(`:${encodeURIComponent(password)}@`, ':••••••••@')
    : databaseUrl;
  return {
    id,
    environment,
    driver,
    host,
    ...(port ? { port } : {}),
    ...(database ? { database } : {}),
    ...(username ? { username } : {}),
    passwordConfigured: Boolean(password),
    maskedUrl,
    source: 'rails-database-yml',
    sourceDetail: 'config/database.yml',
    databaseUrl,
  };
}

function parseRails(
  contents: string,
  env: Record<string, string>,
): DetectedDatabase[] {
  const results: DetectedDatabase[] = [];
  let defaults: Record<string, string> = {};
  let sectionName = '';
  let sectionLines: string[] = [];

  const flush = () => {
    if (!sectionName) return;
    if (sectionName === 'default') {
      defaults = collectFields(sectionLines, 2);
      sectionLines = [];
      return;
    }

    const databaseKeys = sectionLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^ {2}[a-z_]+:\s*(?:&\S+)?\s*$/i.test(line));

    if (databaseKeys.length === 0) {
      const item = buildEnvironment(
        sectionName,
        null,
        collectFields(sectionLines, 2),
        defaults,
        env,
      );
      if (item) results.push(item);
    } else {
      databaseKeys.forEach(({ line, index }, position) => {
        const databaseName = line.trim().replace(/:.*$/, '');
        const nextIndex =
          databaseKeys[position + 1]?.index ?? sectionLines.length;
        const item = buildEnvironment(
          sectionName,
          databaseName,
          collectFields(sectionLines.slice(index + 1, nextIndex), 4),
          defaults,
          env,
        );
        if (item) results.push(item);
      });
    }
    sectionLines = [];
  };

  for (const rawLine of contents.split(/\r?\n/)) {
    if (/^\S[^:]*:\s*(?:&\S+)?\s*$/.test(rawLine)) {
      flush();
      sectionName = rawLine.split(':')[0]?.trim() ?? '';
      continue;
    }
    if (sectionName) sectionLines.push(rawLine);
  }
  flush();
  return results;
}

function fromEnv(
  values: Record<string, string>,
  detail: string,
): DetectedDatabase[] {
  const results: DetectedDatabase[] = [];
  if (values.DATABASE_URL) {
    const item = fromUrl(
      `dotenv-${detail.replace(/\W/g, '-')}`,
      detail === '.env'
        ? 'development'
        : detail.replace(/^\.env\.?/, '') || 'development',
      values.DATABASE_URL,
      'dotenv',
      detail,
    );
    if (item) results.push(item);
  } else if (values.DB_HOST || values.DB_NAME || values.DB_DATABASE) {
    const driver = values.DB_ADAPTER ?? values.DB_CONNECTION ?? 'desconhecido';
    const port = Number(values.DB_PORT) || defaultPorts[driver];
    results.push({
      id: `dotenv-${detail.replace(/\W/g, '-')}`,
      environment:
        detail === '.env' ? 'development' : detail.replace(/^\.env\.?/, ''),
      driver,
      ...(values.DB_HOST ? { host: values.DB_HOST } : {}),
      ...(port ? { port } : {}),
      ...((values.DB_NAME ?? values.DB_DATABASE)
        ? { database: values.DB_NAME ?? values.DB_DATABASE }
        : {}),
      ...((values.DB_USER ?? values.DB_USERNAME)
        ? { username: values.DB_USER ?? values.DB_USERNAME }
        : {}),
      passwordConfigured: Boolean(values.DB_PASSWORD),
      source: 'dotenv',
      sourceDetail: detail,
    });
  }
  return results;
}

async function checkReachability(
  host?: string,
  port?: number,
): Promise<DatabaseReachability> {
  if (!host || !port) return 'unknown';

  const normalizedHost = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(normalizedHost))
    return 'unknown';

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value: DatabaseReachability) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish('reachable'));
    socket.once('timeout', () => finish('unreachable'));
    socket.once('error', () => finish('unreachable'));
  });
}

export class DatabaseDetectionService {
  public constructor(
    private readonly runCommand: CommandRunner = defaultCommandRunner,
  ) {}

  public async detect(project: Project): Promise<DetectedDatabase[]> {
    const dotenvFiles = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.test',
      '.env.production',
    ];
    const env: Record<string, string> = {};
    const detected: DetectedDatabase[] = [];
    for (const file of dotenvFiles) {
      const contents = await safeRead(project.path, file);
      if (contents === null) continue;
      const values = parseDotenv(contents);
      Object.assign(env, values);
      detected.push(...fromEnv(values, file));
    }
    const rails = await safeRead(project.path, 'config/database.yml');

    // O processo da API pode conter credenciais alheias ao projeto. Apenas os
    // arquivos de ambiente do próprio projeto participam da interpolação.
    if (rails !== null) detected.push(...parseRails(rails, env));
    const prisma = await safeRead(project.path, 'prisma/schema.prisma');
    if (prisma) {
      for (const match of prisma.matchAll(
        /url\s*=\s*env\(["']([^"']+)["']\)/g,
      )) {
        const name = match[1] ?? '';
        const value = env[name];

        if (value) {
          const item = fromUrl(
            `prisma-${name.toLowerCase()}`,
            'development',
            value,
            'prisma',
            `prisma/schema.prisma (${name})`,
          );
          if (item) detected.push(item);
        }
      }
    }
    // Um knexfile é sinalizado somente quando sua configuração também está disponível em variáveis DB_*.
    for (const file of [
      'knexfile.js',
      'knexfile.cjs',
      'knexfile.mjs',
      'knexfile.ts',
    ]) {
      if (await exists(path.join(project.path, file))) {
        const item = fromEnv(env, file)[0];
        if (item)
          detected.push({
            ...item,
            id: `knex-${item.id}`,
            source: 'knex',
            sourceDetail: file,
          });
        break;
      }
    }

    return [
      ...new Map(
        detected.map((item) => [
          `${item.environment}:${item.databaseUrl ?? item.database ?? item.id}`,
          item,
        ]),
      ).values(),
    ];
  }

  public async getOverview(
    project: Project,
    page = 1,
    pageSize = 20,
  ): Promise<ProjectDatabaseOverview> {
    const all = await this.detect(project);
    const selected = all.slice((page - 1) * pageSize, page * pageSize);

    const environments = await Promise.all(
      selected.map(async ({ databaseUrl: _secret, ...item }) => ({
        ...item,
        reachability: await checkReachability(item.host, item.port),
        serviceAvailable: localSystemdService(item) !== null,
      })),
    );

    return {
      supported: all.length > 0,
      environments,
      page,
      pageSize,
      total: all.length,
    };
  }

  public async reveal(
    project: Project,
    environmentId: string,
  ): Promise<string | null> {
    return (
      (await this.detect(project)).find((item) => item.id === environmentId)
        ?.databaseUrl ?? null
    );
  }

  public async start(
    project: Project,
    environmentId: string,
  ): Promise<boolean> {
    return this.runServiceAction(project, environmentId, 'start');
  }

  public async stop(project: Project, environmentId: string): Promise<boolean> {
    return this.runServiceAction(project, environmentId, 'stop');
  }

  public async restart(
    project: Project,
    environmentId: string,
  ): Promise<boolean> {
    return this.runServiceAction(project, environmentId, 'restart');
  }

  private async runServiceAction(
    project: Project,
    environmentId: string,
    action: DatabaseServiceAction,
  ): Promise<boolean> {
    const item = (await this.detect(project)).find(
      (candidate) => candidate.id === environmentId,
    );
    if (!item) return false;
    const service = localSystemdService(item);
    if (!service) return false;
    try {
      // A API roda em uma sessão destacada. O agente polkit da sessão do usuário
      // pode autenticar esta ação sem depender do ticket sudo de um terminal.
      // O agente interno fica desabilitado para nunca bloquear a API em um prompt.
      await this.runCommand(
        'pkexec',
        ['--disable-internal-agent', 'systemctl', action, service],
        { cwd: project.path },
      );
    } catch (error) {
      throw new DatabaseServiceActionError(
        action,
        serviceActionFailureReason(error),
        { cause: error },
      );
    }
    return true;
  }
}
