import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProductionBackupPolicy,
  ProductionCommandId,
  ProductionCommands,
  ProductionContractV1,
  ProductionContractWarning,
  ProductionExternalReference,
  ProductionHealthCheck,
  ProductionMigrationPolicy,
  ProductionPolicies,
  ProductionProvider,
  ProductionRollbackPolicy,
  ProductionStrategy,
} from '@dev-dashboard/contracts';

const MANIFEST_RELATIVE_PATH = '.dev-dashboard/production.json' as const;

const SCRIPT_BY_OPERATION = {
  status: 'prod:status',
  check: 'prod:check',
  backup: 'prod:backup',
  migrate: 'prod:migrate',
  deploy: 'prod:deploy',
  verify: 'prod:verify',
  restoreCheck: 'prod:restore-check',
  rollback: 'prod:rollback',
  logs: 'prod:logs',
} as const satisfies Record<ProductionCommandId, string>;

const STRATEGIES = ['command', 'git-managed', 'disabled'] as const;
const PROVIDERS = ['systemd', 'docker-compose', 'vercel', 'none'] as const;
const BACKUP_POLICIES = [
  'required-before-migration',
  'required-before-deploy',
  'external',
  'not-configured',
] as const;
const MIGRATION_POLICIES = [
  'startup',
  'before-deploy',
  'not-configured',
] as const;
const ROLLBACK_POLICIES = [
  'restore-backup-when-schema-changed',
  'manual-restore',
  'provider-only-when-schema-compatible',
  'not-configured',
] as const;

interface ProductionContractDetection {
  contract?: ProductionContractV1;
  warning?: ProductionContractWarning;
}

type PackageScripts = Record<string, string> | undefined;

type ParseResult<T> =
  | { value: T; warning?: never }
  | { value?: never; warning: ProductionContractWarning };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function warning(
  code: ProductionContractWarning['code'],
  message: string,
): ProductionContractWarning {
  return {
    code,
    message,
    manifestPath: MANIFEST_RELATIVE_PATH,
  };
}

function fail(
  code: ProductionContractWarning['code'],
  message: string,
): ProductionContractDetection {
  return { warning: warning(code, message) };
}

function parseFail<T>(
  code: ProductionContractWarning['code'],
  message: string,
): ParseResult<T> {
  return { warning: warning(code, message) };
}

function isBoundedString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isReasonCode(value: unknown): value is string {
  return (
    isBoundedString(value, 128) && /^[a-z0-9][a-z0-9-]*$/.test(value)
  );
}

function isSafeRelativePath(value: unknown): value is string {
  if (!isBoundedString(value, 512) || path.isAbsolute(value)) {
    return false;
  }

  const segments = value.split(/[\\/]+/);
  return !segments.includes('..') && !segments.includes('');
}

function parseCommands(
  value: unknown,
  scripts: PackageScripts,
): ParseResult<ProductionCommands> {
  if (!isRecord(value)) {
    return parseFail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O campo production.commands precisa ser um objeto de operações canônicas.',
    );
  }

  const operations = Object.keys(SCRIPT_BY_OPERATION) as ProductionCommandId[];
  if (!hasOnlyKeys(value, operations)) {
    return parseFail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O manifesto declara uma operação de produção desconhecida.',
    );
  }

  const normalized: Partial<Record<ProductionCommandId, string>> = {};

  for (const operation of operations) {
    if (!(operation in value)) {
      continue;
    }

    const expectedScript = SCRIPT_BY_OPERATION[operation];
    if (value[operation] !== expectedScript) {
      return parseFail(
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
        `A operação ${operation} deve referenciar o script canônico ${expectedScript}.`,
      );
    }

    if (typeof scripts?.[expectedScript] !== 'string') {
      return parseFail(
        'PRODUCTION_CONTRACT_SCRIPT_MISSING',
        `O manifesto referencia ${expectedScript}, mas esse script não existe no package.json.`,
      );
    }

    normalized[operation] = expectedScript;
  }

  return { value: normalized as ProductionCommands };
}

function hasRequiredCommands(
  commands: ProductionCommands,
  required: Array<keyof ProductionCommands>,
): boolean {
  return required.every((operation) => typeof commands[operation] === 'string');
}

function parsePolicies(value: unknown): ParseResult<ProductionPolicies> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['backup', 'migrations', 'rollback']) ||
    !isOneOf(value.backup, BACKUP_POLICIES) ||
    !isOneOf(value.migrations, MIGRATION_POLICIES) ||
    !isOneOf(value.rollback, ROLLBACK_POLICIES)
  ) {
    return parseFail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.policies precisa declarar backup, migrations e rollback suportados.',
    );
  }

  return {
    value: {
      backup: value.backup as ProductionBackupPolicy,
      migrations: value.migrations as ProductionMigrationPolicy,
      rollback: value.rollback as ProductionRollbackPolicy,
    },
  };
}

function parseHealth(value: unknown): ParseResult<ProductionHealthCheck> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['type', 'url']) ||
    value.type !== 'http' ||
    !isBoundedString(value.url, 2048)
  ) {
    return parseFail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.health precisa declarar uma URL HTTP/HTTPS válida sem credenciais.',
    );
  }

  try {
    const parsedUrl = new URL(value.url);
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username.length > 0 ||
      parsedUrl.password.length > 0 ||
      parsedUrl.search.length > 0 ||
      parsedUrl.hash.length > 0
    ) {
      throw new Error('URL de health não permitida');
    }
  } catch {
    return parseFail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.health precisa declarar uma URL HTTP/HTTPS válida sem credenciais.',
    );
  }

  return { value: { type: 'http', url: value.url } };
}

function parseExternal(
  value: unknown,
): ParseResult<ProductionExternalReference> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['project']) ||
    !isBoundedString(value.project, 128)
  ) {
    return parseFail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.external precisa declarar um identificador de projeto válido.',
    );
  }

  return { value: { project: value.project } };
}

function validateStrategy(
  enabled: boolean,
  strategy: ProductionStrategy,
  provider: ProductionProvider,
  commands: ProductionCommands,
  external: ProductionExternalReference | undefined,
): string | null {
  if (strategy === 'command') {
    if (!enabled || !['systemd', 'docker-compose'].includes(provider)) {
      return 'strategy=command exige produção habilitada e provider systemd ou docker-compose.';
    }
    if (!hasRequiredCommands(commands, ['status', 'check', 'deploy', 'verify'])) {
      return 'strategy=command exige os scripts canônicos status, check, deploy e verify.';
    }
    return null;
  }

  if (strategy === 'git-managed') {
    if (!enabled || provider !== 'vercel') {
      return 'strategy=git-managed exige produção habilitada e provider vercel.';
    }
    if (!hasRequiredCommands(commands, ['check', 'verify']) || commands.deploy) {
      return 'strategy=git-managed exige check/verify e não pode declarar deploy local.';
    }
    if (!external) {
      return 'strategy=git-managed exige a referência external.project.';
    }
    return null;
  }

  if (enabled || provider !== 'none') {
    return 'strategy=disabled exige production.enabled=false e provider=none.';
  }
  if (!hasRequiredCommands(commands, ['status', 'check'])) {
    return 'strategy=disabled exige ao menos os scripts canônicos status e check.';
  }
  return null;
}

function parseManifest(
  parsed: unknown,
  scripts: PackageScripts,
): ProductionContractDetection {
  if (!isRecord(parsed) || !hasOnlyKeys(parsed, ['version', 'production'])) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O manifesto precisa conter somente version e production.',
    );
  }

  if (!('version' in parsed)) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O manifesto não declara uma versão.',
    );
  }

  if (parsed.version !== 1) {
    return fail(
      'PRODUCTION_CONTRACT_UNSUPPORTED_VERSION',
      'A versão declarada do contrato de produção não é suportada.',
    );
  }

  if (
    !isRecord(parsed.production) ||
    !hasOnlyKeys(parsed.production, [
      'enabled',
      'strategy',
      'provider',
      'branch',
      'documentation',
      'commands',
      'health',
      'external',
      'reasonCode',
      'blockedBy',
      'policies',
    ])
  ) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O campo production possui estrutura ou campos inválidos.',
    );
  }

  const production = parsed.production;
  if (
    typeof production.enabled !== 'boolean' ||
    !isOneOf(production.strategy, STRATEGIES) ||
    !isOneOf(production.provider, PROVIDERS) ||
    !isBoundedString(production.branch, 128)
  ) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'enabled, strategy, provider e branch precisam usar valores suportados pelo contrato v1.',
    );
  }

  if (
    production.documentation !== undefined &&
    !isSafeRelativePath(production.documentation)
  ) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'documentation precisa ser um caminho relativo seguro dentro do projeto.',
    );
  }

  const commandsResult = parseCommands(production.commands, scripts);
  if (commandsResult.warning) {
    return { warning: commandsResult.warning };
  }

  const policiesResult = parsePolicies(production.policies);
  if (policiesResult.warning) {
    return { warning: policiesResult.warning };
  }

  let health: ProductionHealthCheck | undefined;
  if (production.health !== undefined) {
    const result = parseHealth(production.health);
    if (result.warning) return { warning: result.warning };
    health = result.value;
  }

  let external: ProductionExternalReference | undefined;
  if (production.external !== undefined) {
    const result = parseExternal(production.external);
    if (result.warning) return { warning: result.warning };
    external = result.value;
  }

  if (
    production.reasonCode !== undefined &&
    !isReasonCode(production.reasonCode)
  ) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.reasonCode precisa usar um identificador estável em kebab-case.',
    );
  }

  if (
    production.blockedBy !== undefined &&
    (!Array.isArray(production.blockedBy) ||
      production.blockedBy.length === 0 ||
      production.blockedBy.length > 32 ||
      !production.blockedBy.every(isReasonCode))
  ) {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.blockedBy precisa conter entre 1 e 32 reason codes válidos.',
    );
  }

  const strategyError = validateStrategy(
    production.enabled,
    production.strategy,
    production.provider,
    commandsResult.value,
    external,
  );
  if (strategyError) {
    return fail('PRODUCTION_CONTRACT_INVALID_SHAPE', strategyError);
  }

  return {
    contract: {
      version: 1,
      enabled: production.enabled,
      strategy: production.strategy,
      provider: production.provider,
      branch: production.branch,
      commands: commandsResult.value,
      policies: policiesResult.value,
      ...(production.documentation !== undefined
        ? { documentation: production.documentation }
        : {}),
      ...(health ? { health } : {}),
      ...(external ? { external } : {}),
      ...(production.reasonCode !== undefined
        ? { reasonCode: production.reasonCode }
        : {}),
      ...(production.blockedBy !== undefined
        ? { blockedBy: [...production.blockedBy] as string[] }
        : {}),
    },
  };
}

export async function detectProductionContract(
  projectPath: string,
  scripts: PackageScripts,
): Promise<ProductionContractDetection> {
  const manifestPath = path.join(projectPath, MANIFEST_RELATIVE_PATH);
  let contents: string;

  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    return fail(
      'PRODUCTION_CONTRACT_UNREADABLE',
      'Não foi possível ler o manifesto de produção.',
    );
  }

  try {
    return parseManifest(JSON.parse(contents), scripts);
  } catch {
    return fail(
      'PRODUCTION_CONTRACT_INVALID_JSON',
      'O manifesto de produção não contém JSON válido.',
    );
  }
}
