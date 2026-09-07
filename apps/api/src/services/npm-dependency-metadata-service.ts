import type {
  NodeDependencyInventory,
  NodeDependencyInventoryEntry,
} from './node-dependency-inventory-service.js';

const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_CONCURRENT = 6;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_VERSION_LENGTH = 256;
const MAX_ENGINE_RANGE_LENGTH = 256;

export type DependencyUpdateKind =
  'none' | 'patch' | 'minor' | 'major' | 'unknown';
export type NpmDependencyMetadataState =
  'available' | 'unavailable' | 'invalid';
export type NodeRuntimeCompatibility =
  'compatible' | 'incompatible' | 'unknown';

export interface NpmDependencyMetadata {
  name: string;
  state: NpmDependencyMetadataState;
  source: 'npm-registry';
  observedAt: string;
  latestVersion?: string;
  latestNodeEngine?: string;
  runtimeVersion?: string;
  latestRuntimeCompatibility: NodeRuntimeCompatibility;
  update: DependencyUpdateKind;
  diagnostic?: string;
}

export interface NodeDependencyHealthSnapshot {
  inventory: NodeDependencyInventory;
  metadata: NpmDependencyMetadata[];
}

export type NpmRegistryFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface NpmDependencyMetadataServiceOptions {
  fetcher?: NpmRegistryFetch;
  now?: () => Date;
  timeoutMs?: number;
  maxConcurrent?: number;
  /**
   * Runtime do projeto previamente comprovado pelo chamador. O serviço não usa
   * process.versions.node como fallback, pois o runtime da API não prova o
   * runtime efetivo do projeto.
   */
  runtimeVersion?: string;
}

interface ParsedVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: boolean;
}

interface ParsedEngineVersion {
  version: ParsedVersion;
  precision: 1 | 2 | 3;
}

function parseVersion(value: string): ParsedVersion | undefined {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      value,
    );
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4] !== undefined,
  };
}

function comparePart(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareVersion(left: ParsedVersion, right: ParsedVersion): number {
  const major = comparePart(left.major, right.major);
  if (major !== 0) return major;
  const minor = comparePart(left.minor, right.minor);
  if (minor !== 0) return minor;
  return comparePart(left.patch, right.patch);
}

function stableRuntimeVersion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/^v/u, '');
  if (!normalized || normalized.length > MAX_VERSION_LENGTH) return undefined;
  const parsed = parseVersion(normalized);
  return parsed && !parsed.prerelease ? normalized : undefined;
}

function parseEngineVersion(value: string): ParsedEngineVersion | undefined {
  const match =
    /^(?:v)?(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/u.exec(value);
  if (!match?.[1]) return undefined;

  const precision: 1 | 2 | 3 = match[3] ? 3 : match[2] ? 2 : 1;
  return {
    version: {
      major: BigInt(match[1]),
      minor: BigInt(match[2] ?? '0'),
      patch: BigInt(match[3] ?? '0'),
      prerelease: false,
    },
    precision,
  };
}

function incrementForPrecision(
  value: ParsedVersion,
  precision: 1 | 2 | 3,
): ParsedVersion {
  if (precision === 1) {
    return {
      major: value.major + 1n,
      minor: 0n,
      patch: 0n,
      prerelease: false,
    };
  }
  if (precision === 2) {
    return {
      major: value.major,
      minor: value.minor + 1n,
      patch: 0n,
      prerelease: false,
    };
  }
  return {
    major: value.major,
    minor: value.minor,
    patch: value.patch + 1n,
    prerelease: false,
  };
}

function evaluateBareVersion(
  runtime: ParsedVersion,
  target: ParsedEngineVersion,
): boolean {
  if (target.precision === 3) {
    return compareVersion(runtime, target.version) === 0;
  }
  return (
    compareVersion(runtime, target.version) >= 0 &&
    compareVersion(
      runtime,
      incrementForPrecision(target.version, target.precision),
    ) < 0
  );
}

function evaluateCaret(
  runtime: ParsedVersion,
  target: ParsedEngineVersion,
): boolean {
  let upper: ParsedVersion;
  if (target.precision === 1 || target.version.major > 0n) {
    upper = {
      major: target.version.major + 1n,
      minor: 0n,
      patch: 0n,
      prerelease: false,
    };
  } else if (target.precision === 2 || target.version.minor > 0n) {
    upper = {
      major: 0n,
      minor: target.version.minor + 1n,
      patch: 0n,
      prerelease: false,
    };
  } else {
    upper = {
      major: 0n,
      minor: 0n,
      patch: target.version.patch + 1n,
      prerelease: false,
    };
  }
  return (
    compareVersion(runtime, target.version) >= 0 &&
    compareVersion(runtime, upper) < 0
  );
}

function evaluateTilde(
  runtime: ParsedVersion,
  target: ParsedEngineVersion,
): boolean {
  const upper: ParsedVersion =
    target.precision === 1
      ? {
          major: target.version.major + 1n,
          minor: 0n,
          patch: 0n,
          prerelease: false,
        }
      : {
          major: target.version.major,
          minor: target.version.minor + 1n,
          patch: 0n,
          prerelease: false,
        };
  return (
    compareVersion(runtime, target.version) >= 0 &&
    compareVersion(runtime, upper) < 0
  );
}

function evaluateComparator(
  runtime: ParsedVersion,
  token: string,
): boolean | undefined {
  if (token === '*' || token.toLowerCase() === 'x') return true;

  const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/u.exec(token);
  if (!match?.[2]) return undefined;
  const operator = match[1] ?? '';
  const target = parseEngineVersion(match[2]);
  if (!target) return undefined;

  if (operator === '^') return evaluateCaret(runtime, target);
  if (operator === '~') return evaluateTilde(runtime, target);
  if (!operator || operator === '=')
    return evaluateBareVersion(runtime, target);

  const comparison = compareVersion(runtime, target.version);
  switch (operator) {
    case '>=':
      return comparison >= 0;
    case '>':
      return target.precision === 3
        ? comparison > 0
        : compareVersion(
            runtime,
            incrementForPrecision(target.version, target.precision),
          ) >= 0;
    case '<=':
      return target.precision === 3
        ? comparison <= 0
        : compareVersion(
            runtime,
            incrementForPrecision(target.version, target.precision),
          ) < 0;
    case '<':
      return comparison < 0;
    default:
      return undefined;
  }
}

function evaluateAndClause(
  runtime: ParsedVersion,
  clause: string,
): boolean | undefined {
  const tokens = clause.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return undefined;

  const results = tokens.map((token) => evaluateComparator(runtime, token));
  if (results.some((result) => result === undefined)) return undefined;
  return results.every((result) => result === true);
}

export function evaluateNodeRuntimeCompatibility(
  runtimeVersion: string | undefined,
  requiredRange: string | undefined,
): NodeRuntimeCompatibility {
  const normalizedRuntime = stableRuntimeVersion(runtimeVersion);
  const normalizedRange = requiredRange?.trim();
  if (
    !normalizedRuntime ||
    !normalizedRange ||
    normalizedRange.length > MAX_ENGINE_RANGE_LENGTH ||
    normalizedRange.includes('\0')
  ) {
    return 'unknown';
  }

  const runtime = parseVersion(normalizedRuntime);
  if (!runtime || runtime.prerelease) return 'unknown';

  const clauses = normalizedRange.split('||');
  let unknown = false;
  for (const clause of clauses) {
    const result = evaluateAndClause(runtime, clause);
    if (result === true) return 'compatible';
    if (result === undefined) unknown = true;
  }
  return unknown ? 'unknown' : 'incompatible';
}

export function classifyDependencyUpdate(
  currentVersion: string | undefined,
  latestVersion: string,
): DependencyUpdateKind {
  if (!currentVersion) return 'unknown';
  if (currentVersion === latestVersion) return 'none';

  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);
  if (!current || !latest || current.prerelease || latest.prerelease) {
    return 'unknown';
  }

  const major = comparePart(current.major, latest.major);
  if (major > 0) return 'none';
  if (major < 0) return 'major';

  const minor = comparePart(current.minor, latest.minor);
  if (minor > 0) return 'none';
  if (minor < 0) return 'minor';

  const patch = comparePart(current.patch, latest.patch);
  return patch < 0 ? 'patch' : 'none';
}

function registryUrl(packageName: string): string {
  const encoded = encodeURIComponent(packageName).replace(/^%40/u, '@');
  return `${NPM_REGISTRY_ORIGIN}/${encoded}/latest`;
}

async function boundedText(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_RESPONSE_BYTES) {
      throw new Error('payload-too-large');
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('payload-too-large');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('payload-too-large');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function latestMetadataFrom(value: unknown): {
  version?: string;
  nodeEngine?: string;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const record = value as { version?: unknown; engines?: unknown };
  const version =
    typeof record.version === 'string' ? record.version.trim() : undefined;
  let nodeEngine: string | undefined;
  if (
    typeof record.engines === 'object' &&
    record.engines !== null &&
    !Array.isArray(record.engines)
  ) {
    const candidate = (record.engines as { node?: unknown }).node;
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (
        normalized &&
        normalized.length <= MAX_ENGINE_RANGE_LENGTH &&
        !normalized.includes('\0')
      ) {
        nodeEngine = normalized;
      }
    }
  }

  return {
    ...(version &&
    version.length <= MAX_VERSION_LENGTH &&
    !version.includes('\0')
      ? { version }
      : {}),
    ...(nodeEngine ? { nodeEngine } : {}),
  };
}

export class NpmDependencyMetadataService {
  private readonly fetcher: NpmRegistryFetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private readonly runtimeVersion: string | undefined;

  public constructor(options: NpmDependencyMetadataServiceOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = Math.max(10, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxConcurrent = Math.max(
      1,
      Math.floor(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT),
    );
    this.runtimeVersion = stableRuntimeVersion(options.runtimeVersion);
  }

  public async enrich(
    inventory: NodeDependencyInventory,
  ): Promise<NodeDependencyHealthSnapshot> {
    if (inventory.status !== 'ready' || inventory.dependencies.length === 0) {
      return { inventory, metadata: [] };
    }

    const metadata = new Array<NpmDependencyMetadata>(
      inventory.dependencies.length,
    );
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        const dependency = inventory.dependencies[index];
        if (!dependency) return;
        metadata[index] = await this.fetchDependency(dependency);
      }
    };

    const workers = Math.min(this.maxConcurrent, inventory.dependencies.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    return { inventory, metadata };
  }

  private async fetchDependency(
    dependency: NodeDependencyInventoryEntry,
  ): Promise<NpmDependencyMetadata> {
    const observedAt = this.now().toISOString();
    const base = {
      name: dependency.name,
      source: 'npm-registry' as const,
      observedAt,
      ...(this.runtimeVersion ? { runtimeVersion: this.runtimeVersion } : {}),
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();

    try {
      const response = await this.fetcher(registryUrl(dependency.name), {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ...base,
          state: 'unavailable',
          latestRuntimeCompatibility: 'unknown',
          update: 'unknown',
          diagnostic: `npm registry respondeu HTTP ${response.status}.`,
        };
      }

      let payload: unknown;
      try {
        payload = JSON.parse(await boundedText(response)) as unknown;
      } catch {
        return {
          ...base,
          state: 'invalid',
          latestRuntimeCompatibility: 'unknown',
          update: 'unknown',
          diagnostic: 'Metadata npm excedeu o limite ou possui JSON inválido.',
        };
      }
      const latest = latestMetadataFrom(payload);
      if (!latest.version || !parseVersion(latest.version)) {
        return {
          ...base,
          state: 'invalid',
          latestRuntimeCompatibility: 'unknown',
          update: 'unknown',
          diagnostic: 'Metadata npm não possui uma versão latest comparável.',
        };
      }

      return {
        ...base,
        state: 'available',
        latestVersion: latest.version,
        ...(latest.nodeEngine ? { latestNodeEngine: latest.nodeEngine } : {}),
        latestRuntimeCompatibility: evaluateNodeRuntimeCompatibility(
          this.runtimeVersion,
          latest.nodeEngine,
        ),
        update: classifyDependencyUpdate(
          dependency.resolvedVersion,
          latest.version,
        ),
      };
    } catch {
      return {
        ...base,
        state: 'unavailable',
        latestRuntimeCompatibility: 'unknown',
        update: 'unknown',
        diagnostic: 'npm registry está indisponível ou excedeu o timeout.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
