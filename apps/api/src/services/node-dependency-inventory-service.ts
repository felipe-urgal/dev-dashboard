import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';
import { parse as parseYaml } from 'yaml';

import {
  detectNodePackageManager,
  type NodePackageManager,
} from './node-package-manager-service.js';

const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;
const MAX_LOCKFILE_BYTES = 8 * 1024 * 1024;
const MAX_DIRECT_DEPENDENCIES = 5_000;
const MAX_NAME_LENGTH = 214;
const MAX_VERSION_TEXT_LENGTH = 512;
const SUPPORTED_NPM_LOCKFILE_VERSIONS = new Set([1, 2, 3]);

export type NodeDependencyKind = 'dependency' | 'devDependency';
export type NodeDependencyResolution = 'resolved' | 'unknown';
export type NodeDependencyInventoryStatus = 'ready' | 'unavailable' | 'invalid';
export type NodeDependencyLockfileState =
  'present' | 'missing' | 'unsupported' | 'invalid';
export type NodeDependencyPackageManager = NodePackageManager | 'unknown';

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
  packageManager: NodeDependencyPackageManager;
  observedAt: string;
  lockfile: NodeDependencyLockfileState;
  lockfileName?: string;
  lockfileVersion?: number;
  dependencies: NodeDependencyInventoryEntry[];
  warnings: string[];
}

interface JsonObject {
  [key: string]: unknown;
}

interface ReadTextResult {
  state: 'present' | 'missing' | 'invalid';
  text?: string;
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

async function readBoundedFile(
  root: string,
  fileName: string,
  maxBytes: number,
): Promise<ReadTextResult> {
  const candidate = path.join(root, fileName);
  try {
    const stat = await lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
      return { state: 'invalid' };
    }
    const resolved = await realpath(candidate);
    if (resolved !== candidate) return { state: 'invalid' };
    return { state: 'present', text: await readFile(candidate, 'utf8') };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'missing' };
    }
    return { state: 'invalid' };
  }
}

function parseJson(result: ReadTextResult): unknown | undefined {
  if (result.state !== 'present' || result.text === undefined) return undefined;
  try {
    return JSON.parse(result.text) as unknown;
  } catch {
    return undefined;
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

function npmLockfileVersion(lock: JsonObject): number | undefined {
  const value = lock.lockfileVersion;
  return Number.isInteger(value) ? (value as number) : undefined;
}

function resolvedFromModernNpmLock(
  lock: JsonObject,
  dependencyName: string,
): string | undefined {
  const packages = lock.packages;
  if (!isObject(packages)) return undefined;
  const entry = packages[`node_modules/${dependencyName}`];
  return isObject(entry) ? safeText(entry.version, 256) : undefined;
}

function resolvedFromLegacyNpmLock(
  lock: JsonObject,
  dependencyName: string,
): string | undefined {
  const dependencies = lock.dependencies;
  if (!isObject(dependencies)) return undefined;
  const entry = dependencies[dependencyName];
  return isObject(entry) ? safeText(entry.version, 256) : undefined;
}

function normalizedPnpmVersion(value: unknown): string | undefined {
  const raw = safeText(value, 256);
  if (!raw) return undefined;
  const normalized = raw.replace(/^npm:/u, '').split('(')[0]?.trim();
  if (
    !normalized ||
    normalized.startsWith('link:') ||
    normalized.startsWith('workspace:')
  ) {
    return undefined;
  }
  return normalized;
}

function dependencyFromSection(
  section: unknown,
  dependencyName: string,
): unknown {
  return isObject(section) ? section[dependencyName] : undefined;
}

function resolvedFromPnpmLock(
  lock: JsonObject,
  dependency: Pick<
    NodeDependencyInventoryEntry,
    'name' | 'kind' | 'declaredRange'
  >,
): string | undefined {
  const importers = lock.importers;
  const rootImporter = isObject(importers) ? importers['.'] : undefined;
  const sectionName =
    dependency.kind === 'dependency' ? 'dependencies' : 'devDependencies';
  const fromImporter = isObject(rootImporter)
    ? dependencyFromSection(rootImporter[sectionName], dependency.name)
    : undefined;
  const candidate =
    fromImporter ?? dependencyFromSection(lock[sectionName], dependency.name);

  if (typeof candidate === 'string') return normalizedPnpmVersion(candidate);
  if (!isObject(candidate)) return undefined;
  return normalizedPnpmVersion(candidate.version);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function resolvedFromYarnLock(
  text: string,
  dependency: Pick<
    NodeDependencyInventoryEntry,
    'name' | 'kind' | 'declaredRange'
  >,
): string | undefined {
  const lines = text.split(/\r?\n/u);
  let inMatchingBlock = false;

  for (const line of lines) {
    if (line && !/^\s/u.test(line)) {
      const header = unquote(line.replace(/:\s*$/u, ''));
      inMatchingBlock =
        header.includes(`${dependency.name}@`) &&
        header.includes(dependency.declaredRange);
      continue;
    }
    if (!inMatchingBlock) continue;

    const classic = /^\s+version\s+["']?([^"'\s]+)["']?\s*$/u.exec(line);
    const berry = /^\s+version:\s*["']?([^"'\s]+)["']?\s*$/u.exec(line);
    const version = classic?.[1] ?? berry?.[1];
    if (!version) continue;
    return version.replace(/^npm:/u, '');
  }

  return undefined;
}

function pnpmLockfileVersion(lock: JsonObject): number | undefined {
  const raw = lock.lockfileVersion;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export class NodeDependencyInventoryService {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public async inspect(project: Project): Promise<NodeDependencyInventory> {
    const observedAt = this.now().toISOString();

    let root: string;
    try {
      root = await realpath(project.path);
    } catch {
      return {
        status: 'unavailable',
        projectId: project.id,
        packageManager: 'unknown',
        observedAt,
        lockfile: 'missing',
        dependencies: [],
        warnings: ['A raiz real do projeto não pôde ser acessada.'],
      };
    }

    const packageResult = await readBoundedFile(
      root,
      'package.json',
      MAX_PACKAGE_JSON_BYTES,
    );
    const packageValue = parseJson(packageResult);
    if (
      packageResult.state !== 'present' ||
      !packageValue ||
      !isObject(packageValue)
    ) {
      return {
        status: packageResult.state === 'missing' ? 'unavailable' : 'invalid',
        projectId: project.id,
        packageManager: 'unknown',
        observedAt,
        lockfile: 'missing',
        dependencies: [],
        warnings: ['package.json ausente ou inválido para inventário local.'],
      };
    }

    const declared = declaredDependencies(packageValue);
    if (!declared) {
      return {
        status: 'invalid',
        projectId: project.id,
        packageManager: 'unknown',
        observedAt,
        lockfile: 'missing',
        dependencies: [],
        warnings: ['As dependências declaradas no package.json são inválidas.'],
      };
    }

    const detection = await detectNodePackageManager(root);
    const packageManager =
      detection.state === 'detected' && detection.manager
        ? detection.manager
        : 'unknown';
    const warnings: string[] = [];
    if (detection.state !== 'detected') {
      warnings.push(
        detection.diagnostic ??
          'O gerenciador Node não pôde ser determinado com segurança.',
      );
    }

    const lockfileName = detection.lockfile;
    if (!lockfileName) {
      if (packageManager === 'bun' && detection.state === 'detected') {
        warnings.push(
          'Nenhum lockfile Bun foi encontrado; versões resolvidas permanecem unknown.',
        );
      } else {
        warnings.push(
          'Lockfile Node ausente; o Dashboard conhece apenas os ranges declarados.',
        );
      }
      return {
        status: 'ready',
        projectId: project.id,
        packageManager,
        observedAt,
        lockfile: detection.state === 'conflict' ? 'invalid' : 'missing',
        dependencies: declared.map((item) => ({
          ...item,
          resolution: 'unknown',
        })),
        warnings,
      };
    }

    const lockResult = await readBoundedFile(
      root,
      lockfileName,
      MAX_LOCKFILE_BYTES,
    );
    if (lockResult.state !== 'present' || lockResult.text === undefined) {
      warnings.push(
        `${lockfileName} não pôde ser validado; versões resolvidas permanecem unknown.`,
      );
      return {
        status: 'ready',
        projectId: project.id,
        packageManager,
        observedAt,
        lockfile: 'invalid',
        lockfileName,
        dependencies: declared.map((item) => ({
          ...item,
          resolution: 'unknown',
        })),
        warnings,
      };
    }

    let lockfile: NodeDependencyLockfileState = 'present';
    let lockfileVersion: number | undefined;
    let resolver:
      | ((
          dependency: Pick<
            NodeDependencyInventoryEntry,
            'name' | 'kind' | 'declaredRange'
          >,
        ) => string | undefined)
      | undefined;

    if (packageManager === 'npm') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(lockResult.text) as unknown;
      } catch {
        parsed = undefined;
      }
      if (!isObject(parsed)) {
        lockfile = 'invalid';
        warnings.push(
          `${lockfileName} não possui JSON válido; versões resolvidas permanecem unknown.`,
        );
      } else {
        lockfileVersion = npmLockfileVersion(parsed);
        if (
          lockfileVersion === undefined ||
          !SUPPORTED_NPM_LOCKFILE_VERSIONS.has(lockfileVersion)
        ) {
          lockfile = 'unsupported';
          warnings.push(
            'A versão do lockfile npm não é suportada por este inventário local.',
          );
        } else {
          resolver = (dependency) =>
            lockfileVersion! >= 2
              ? resolvedFromModernNpmLock(parsed, dependency.name)
              : resolvedFromLegacyNpmLock(parsed, dependency.name);
        }
      }
    } else if (packageManager === 'pnpm') {
      let parsed: unknown;
      try {
        parsed = parseYaml(lockResult.text) as unknown;
      } catch {
        parsed = undefined;
      }
      if (!isObject(parsed)) {
        lockfile = 'invalid';
        warnings.push(
          'pnpm-lock.yaml não pôde ser interpretado; versões resolvidas permanecem unknown.',
        );
      } else {
        lockfileVersion = pnpmLockfileVersion(parsed);
        resolver = (dependency) => resolvedFromPnpmLock(parsed, dependency);
      }
    } else if (packageManager === 'yarn') {
      resolver = (dependency) =>
        resolvedFromYarnLock(lockResult.text!, dependency);
    } else if (packageManager === 'bun') {
      lockfile = 'unsupported';
      warnings.push(
        'Bun é executável pelo Dashboard, mas o inventário ainda não interpreta seu lockfile; versões resolvidas permanecem unknown.',
      );
    } else {
      lockfile = 'invalid';
    }

    const dependencies = declared.map<NodeDependencyInventoryEntry>((item) => {
      const resolvedVersion = resolver?.(item);
      return {
        ...item,
        resolution: resolvedVersion ? 'resolved' : 'unknown',
        ...(resolvedVersion ? { resolvedVersion } : {}),
      };
    });

    return {
      status: 'ready',
      projectId: project.id,
      packageManager,
      observedAt,
      lockfile,
      lockfileName,
      ...(lockfileVersion === undefined ? {} : { lockfileVersion }),
      dependencies,
      warnings,
    };
  }
}
