import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;
const MAX_PACKAGE_LOCK_BYTES = 8 * 1024 * 1024;
const MAX_DIRECT_DEPENDENCIES = 5_000;
const MAX_NAME_LENGTH = 214;
const MAX_VERSION_TEXT_LENGTH = 512;
const SUPPORTED_LOCKFILE_VERSIONS = new Set([1, 2, 3]);

export type NodeDependencyKind = 'dependency' | 'devDependency';
export type NodeDependencyResolution = 'resolved' | 'unknown';
export type NodeDependencyInventoryStatus = 'ready' | 'unavailable' | 'invalid';
export type NodeDependencyLockfileState =
  'present' | 'missing' | 'unsupported' | 'invalid';

export interface NodeDependencyInventoryEntry {
  name: string;
  kind: NodeDependencyKind;
  declaredRange: string;
  resolution: NodeDependencyResolution;
  resolvedVersion?: string;
}

export interface NodeDependencyInventory {
  status: NodeDependencyInventoryStatus;
  projectId: string;
  packageManager: 'npm';
  observedAt: string;
  lockfile: NodeDependencyLockfileState;
  lockfileVersion?: number;
  dependencies: NodeDependencyInventoryEntry[];
  warnings: string[];
}

interface JsonObject {
  [key: string]: unknown;
}

interface ReadJsonResult {
  state: 'present' | 'missing' | 'invalid';
  value?: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(
  value: unknown,
  maxLength = MAX_VERSION_TEXT_LENGTH,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    normalized.includes('\0')
  ) {
    return undefined;
  }
  return normalized;
}

async function readJsonFile(
  root: string,
  fileName: string,
  maxBytes: number,
): Promise<ReadJsonResult> {
  const candidate = path.join(root, fileName);
  try {
    const stat = await lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
      return { state: 'invalid' };
    }
    const resolved = await realpath(candidate);
    if (resolved !== candidate) return { state: 'invalid' };
    const text = await readFile(candidate, 'utf8');
    return { state: 'present', value: JSON.parse(text) as unknown };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'missing' };
    }
    return { state: 'invalid' };
  }
}

function declaredDependencies(
  packageJson: JsonObject,
): Array<
  Pick<NodeDependencyInventoryEntry, 'name' | 'kind' | 'declaredRange'>
> | null {
  const result: Array<
    Pick<NodeDependencyInventoryEntry, 'name' | 'kind' | 'declaredRange'>
  > = [];
  const seen = new Set<string>();

  for (const [sectionName, kind] of [
    ['dependencies', 'dependency'],
    ['devDependencies', 'devDependency'],
  ] as const) {
    const section = packageJson[sectionName];
    if (section === undefined) continue;
    if (!isObject(section)) return null;

    for (const [name, rawRange] of Object.entries(section)) {
      if (seen.has(name)) continue;
      const declaredRange = safeText(rawRange);
      if (
        !declaredRange ||
        !name ||
        name.length > MAX_NAME_LENGTH ||
        name.includes('\0')
      ) {
        return null;
      }
      seen.add(name);
      result.push({ name, kind, declaredRange });
      if (result.length > MAX_DIRECT_DEPENDENCIES) return null;
    }
  }

  return result.sort((left, right) => left.name.localeCompare(right.name));
}

function lockfileVersion(lock: JsonObject): number | undefined {
  const value = lock.lockfileVersion;
  return Number.isInteger(value) ? (value as number) : undefined;
}

function resolvedFromModernLock(
  lock: JsonObject,
  dependencyName: string,
): string | undefined {
  const packages = lock.packages;
  if (!isObject(packages)) return undefined;
  const entry = packages[`node_modules/${dependencyName}`];
  return isObject(entry) ? safeText(entry.version, 256) : undefined;
}

function resolvedFromLegacyLock(
  lock: JsonObject,
  dependencyName: string,
): string | undefined {
  const dependencies = lock.dependencies;
  if (!isObject(dependencies)) return undefined;
  const entry = dependencies[dependencyName];
  return isObject(entry) ? safeText(entry.version, 256) : undefined;
}

function resolveVersion(
  lock: JsonObject,
  version: number,
  dependencyName: string,
): string | undefined {
  if (version >= 2) {
    return resolvedFromModernLock(lock, dependencyName);
  }
  return resolvedFromLegacyLock(lock, dependencyName);
}

export class NodeDependencyInventoryService {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public async inspect(project: Project): Promise<NodeDependencyInventory> {
    const observedAt = this.now().toISOString();
    const base = {
      projectId: project.id,
      packageManager: 'npm' as const,
      observedAt,
    };

    if (project.type !== 'node') {
      return {
        ...base,
        status: 'unavailable',
        lockfile: 'missing',
        dependencies: [],
        warnings: [
          'O inventário npm só se aplica a projetos Node neste recorte.',
        ],
      };
    }

    let root: string;
    try {
      root = await realpath(project.path);
    } catch {
      return {
        ...base,
        status: 'unavailable',
        lockfile: 'missing',
        dependencies: [],
        warnings: ['A raiz real do projeto não pôde ser acessada.'],
      };
    }

    const packageResult = await readJsonFile(
      root,
      'package.json',
      MAX_PACKAGE_JSON_BYTES,
    );
    if (packageResult.state !== 'present' || !isObject(packageResult.value)) {
      return {
        ...base,
        status: 'invalid',
        lockfile: 'missing',
        dependencies: [],
        warnings: ['package.json ausente ou inválido para inventário local.'],
      };
    }

    const declared = declaredDependencies(packageResult.value);
    if (!declared) {
      return {
        ...base,
        status: 'invalid',
        lockfile: 'missing',
        dependencies: [],
        warnings: ['As dependências declaradas no package.json são inválidas.'],
      };
    }

    const lockResult = await readJsonFile(
      root,
      'package-lock.json',
      MAX_PACKAGE_LOCK_BYTES,
    );
    let lockfile: NodeDependencyLockfileState = 'missing';
    let version: number | undefined;
    let lock: JsonObject | undefined;
    const warnings: string[] = [];

    if (lockResult.state === 'invalid') {
      lockfile = 'invalid';
      warnings.push(
        'package-lock.json não pôde ser validado; versões resolvidas permanecem unknown.',
      );
    } else if (lockResult.state === 'present') {
      if (!isObject(lockResult.value)) {
        lockfile = 'invalid';
        warnings.push(
          'package-lock.json não possui estrutura válida; versões resolvidas permanecem unknown.',
        );
      } else {
        version = lockfileVersion(lockResult.value);
        if (
          version === undefined ||
          !SUPPORTED_LOCKFILE_VERSIONS.has(version)
        ) {
          lockfile = 'unsupported';
          warnings.push(
            'A versão do package-lock não é suportada por este inventário local.',
          );
        } else {
          lockfile = 'present';
          lock = lockResult.value;
        }
      }
    } else {
      warnings.push(
        'package-lock.json ausente; o Dashboard conhece apenas os ranges declarados.',
      );
    }

    const dependencies = declared.map<NodeDependencyInventoryEntry>((item) => {
      const resolvedVersion =
        lock && version !== undefined
          ? resolveVersion(lock, version, item.name)
          : undefined;
      return {
        ...item,
        resolution: resolvedVersion ? 'resolved' : 'unknown',
        ...(resolvedVersion ? { resolvedVersion } : {}),
      };
    });

    return {
      ...base,
      status: 'ready',
      lockfile,
      ...(version === undefined ? {} : { lockfileVersion: version }),
      dependencies,
      warnings,
    };
  }
}
