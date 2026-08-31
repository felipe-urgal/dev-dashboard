import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProductionBackupPolicy,
  ProductionCommands,
  ProductionContractV1,
  ProductionContractWarning,
  ProductionMigrationPolicy,
  ProductionPolicies,
  ProductionProvider,
  ProductionRollbackPolicy,
  ProductionStrategy,
} from '@dev-dashboard/contracts';

const MANIFEST_RELATIVE_PATH = '.dev-dashboard/production.json' as const;

const CANONICAL_COMMANDS = {
  status: 'prod:status',
  check: 'prod:check',
  backup: 'prod:backup',
  migrate: 'prod:migrate',
  deploy: 'prod:deploy',
  verify: 'prod:verify',
  restoreCheck: 'prod:restore-check',
  rollback: 'prod:rollback',
  logs: 'prod:logs',
} as const;

const STRATEGIES = new Set<ProductionStrategy>([
  'command',
  'git-managed',
  'disabled',
]);
const PROVIDERS = new Set<ProductionProvider>([
  'systemd',
  'docker-compose',
  'vercel',
  'none',
]);
const BACKUP_POLICIES = new Set<ProductionBackupPolicy>([
  'required-before-migration',
  'required-before-deploy',
  'external',
  'not-configured',
]);
const MIGRATION_POLICIES = new Set<ProductionMigrationPolicy>([
  'startup',
  'before-deploy',
  'not-configured',
]);
const ROLLBACK_POLICIES = new Set<ProductionRollbackPolicy>([
  'restore-backup-when-schema-changed',
  'manual-restore',
  'provider-only-when-schema-compatible',
  'not-configured',
]);

interface ProductionContractDetection {
  contract?: ProductionContractV1;
  warning?: ProductionContractWarning;
}

type PackageScripts = Record<string, string> | undefined;

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
): ProductionContractDetection {
  return {
    warning: {
      code,
      message,
      manifestPath: MANIFEST_RELATIVE_PATH,
    },
  };
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
):
  | { commands: ProductionCommands }
  | { warning: ProductionContractWarning } {
  if (!isRecord(value)) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O campo production.commands precisa ser um objeto de operações canônicas.',
    ) as { warning: ProductionContractWarning };
  }

  if (!hasOnlyKeys(value, Object.keys(CANONICAL_COMMANDS))) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O manifesto declara uma operação de produção desconhecida.',
    ) as { warning: ProductionContractWarning };
  }

  const commands: ProductionCommands = {};

  for (const [operation, expectedScript] of Object.entries(
    CANONICAL_COMMANDS,
  ) as Array<[
    keyof typeof CANONICAL_COMMANDS,
    (typeof CANONICAL_COMMANDS)[keyof typeof CANONICAL_COMMANDS],
  ]>) {
    if (!(operation in value)) {
      continue;
    }

    if (value[operation] !== expectedScript) {
      return warning(
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
        `A operação ${operation} deve referenciar o script canônico ${expectedScript}.`,
      ) as { warning: ProductionContractWarning };
    }

    if (typeof scripts?.[expectedScript] !== 'string') {
      return warning(
        'PRODUCTION_CONTRACT_SCRIPT_MISSING',
        `O manifesto referencia ${expectedScript}, mas esse script não existe no package.json.`,
      ) as { warning: ProductionContractWarning };
    }

    Object.assign(commands, { [operation]: expectedScript });
  }

  return { commands };
}

function hasCommands(
  commands: ProductionCommands,
  required: Array<keyof ProductionCommands>,
): boolean {
  return required.every((command) => typeof commands[command] === 'string');
}

function parsePolicies(
  value: unknown,
): ProductionPolicies | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['backup', 'migrations', 'rollback']) ||
    typeof value.backup !== 'string' ||
    !BACKUP_POLICIES.has(value.backup as ProductionBackupPolicy) ||
    typeof value.migrations !== 'string' ||
    !MIGRATION_POLICIES.has(value.migrations as ProductionMigrationPolicy) ||
    typeof value.rollback !== 'string' ||
    !ROLLBACK_POLICIES.has(value.rollback as ProductionRollbackPolicy)
  ) {
    return null;
  }

  return {
    backup: value.backup as ProductionBackupPolicy,
    migrations: value.migrations as ProductionMigrationPolicy,
    rollback: value.rollback as ProductionRollbackPolicy,
  };
}

function parseHealth(
  value: unknown,
): ProductionContractV1['health'] | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['type', 'url']) ||
    value.type !== 'http' ||
    !isBoundedString(value.url, 2048)
  ) {
    return null;
  }

  try {
    const parsedUrl = new URL(value.url);
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username.length > 0 ||
      parsedUrl.password.length > 0
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { type: 'http', url: value.url };
}

function parseExternal(
  value: unknown,
): ProductionContractV1['external'] | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['project']) ||
    !isBoundedString(value.project, 128)
  ) {
    return null;
  }

  return { project: value.project };
}

function validateStrategy(
  enabled: boolean,
  strategy: ProductionStrategy,
  provider: ProductionProvider,
  commands: ProductionCommands,
  external: ProductionContractV1['external'] | undefined,
): string | null {
  if (strategy === 'command') {
    if (!enabled || !['systemd', 'docker-compose'].includes(provider)) {
      return 'strategy=command exige produção habilitada e provider systemd ou docker-compose.';
    }
    if (!hasCommands(commands, ['status', 'check', 'deploy', 'verify'])) {
      return 'strategy=command exige os scripts canônicos status, check, deploy e verify.';
    }
    return null;
  }

  if (strategy === 'git-managed') {
    if (!enabled || provider !== 'vercel') {
      return 'strategy=git-managed exige produção habilitada e provider vercel.';
    }
    if (!hasCommands(commands, ['check', 'verify']) || commands.deploy) {
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
  if (!hasCommands(commands, ['status', 'check'])) {
    return 'strategy=disabled exige ao menos os scripts canônicos status e check.';
  }
  return null;
}

function parseManifest(
  parsed: unknown,
  scripts: PackageScripts,
): ProductionContractDetection {
  if (!isRecord(parsed) || !hasOnlyKeys(parsed, ['version', 'production'])) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O manifesto precisa conter somente version e production.',
    );
  }

  if (!('version' in parsed)) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O manifesto não declara uma versão.',
    );
  }

  if (parsed.version !== 1) {
    return warning(
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
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'O campo production possui estrutura ou campos inválidos.',
    );
  }

  const production = parsed.production;
  if (
    typeof production.enabled !== 'boolean' ||
    typeof production.strategy !== 'string' ||
    !STRATEGIES.has(production.strategy as ProductionStrategy) ||
    typeof production.provider !== 'string' ||
    !PROVIDERS.has(production.provider as ProductionProvider) ||
    !isBoundedString(production.branch, 128)
  ) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'enabled, strategy, provider e branch precisam usar valores suportados pelo contrato v1.',
    );
  }

  if (
    production.documentation !== undefined &&
    !isSafeRelativePath(production.documentation)
  ) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'documentation precisa ser um caminho relativo seguro dentro do projeto.',
    );
  }

  const commandResult = parseCommands(production.commands, scripts);
  if ('warning' in commandResult) {
    return { warning: commandResult.warning };
  }

  const policies = parsePolicies(production.policies);
  if (!policies) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.policies precisa declarar backup, migrations e rollback suportados.',
    );
  }

  const health =
    production.health === undefined ? undefined : parseHealth(production.health);
  if (production.health !== undefined && !health) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.health precisa declarar uma URL HTTP/HTTPS válida sem credenciais.',
    );
  }

  const external =
    production.external === undefined
      ? undefined
      : parseExternal(production.external);
  if (production.external !== undefined && !external) {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.external precisa declarar um identificador de projeto válido.',
    );
  }

  if (
    production.reasonCode !== undefined &&
    !isReasonCode(production.reasonCode)
  ) {
    return warning(
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
    return warning(
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
      'production.blockedBy precisa conter entre 1 e 32 reason codes válidos.',
    );
  }

  const strategy = production.strategy as ProductionStrategy;
  const provider = production.provider as ProductionProvider;
  const strategyError = validateStrategy(
    production.enabled,
    strategy,
    provider,
    commandResult.commands,
    external,
  );
  if (strategyError) {
    return warning('PRODUCTION_CONTRACT_INVALID_SHAPE', strategyError);
  }

  const contract: ProductionContractV1 = {
    version: 1,
    enabled: production.enabled,
    strategy,
    provider,
    branch: production.branch,
    commands: commandResult.commands,
    policies,
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
  };

  return { contract };
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

    return warning(
      'PRODUCTION_CONTRACT_UNREADABLE',
      'Não foi possível ler o manifesto de produção.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return warning(
      'PRODUCTION_CONTRACT_INVALID_JSON',
      'O manifesto de produção não contém JSON válido.',
    );
  }

  return parseManifest(parsed, scripts);
}
