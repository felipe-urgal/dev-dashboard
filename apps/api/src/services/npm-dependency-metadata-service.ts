import type {
  NodeDependencyInventory,
  NodeDependencyInventoryEntry,
} from './node-dependency-inventory-service.js';

const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_CONCURRENT = 6;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_VERSION_LENGTH = 256;

export type DependencyUpdateKind =
  'none' | 'patch' | 'minor' | 'major' | 'unknown';
export type NpmDependencyMetadataState =
  'available' | 'unavailable' | 'invalid';

export interface NpmDependencyMetadata {
  name: string;
  state: NpmDependencyMetadataState;
  source: 'npm-registry';
  observedAt: string;
  latestVersion?: string;
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
}

interface ParsedVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: boolean;
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

function latestVersionFrom(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const version = (value as { version?: unknown }).version;
  if (typeof version !== 'string') return undefined;
  const normalized = version.trim();
  if (
    !normalized ||
    normalized.length > MAX_VERSION_LENGTH ||
    normalized.includes('\0')
  ) {
    return undefined;
  }
  return normalized;
}

export class NpmDependencyMetadataService {
  private readonly fetcher: NpmRegistryFetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;

  public constructor(options: NpmDependencyMetadataServiceOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = Math.max(10, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxConcurrent = Math.max(
      1,
      Math.floor(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT),
    );
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
          update: 'unknown',
          diagnostic: 'Metadata npm excedeu o limite ou possui JSON inválido.',
        };
      }
      const latestVersion = latestVersionFrom(payload);
      if (!latestVersion || !parseVersion(latestVersion)) {
        return {
          ...base,
          state: 'invalid',
          update: 'unknown',
          diagnostic: 'Metadata npm não possui uma versão latest comparável.',
        };
      }

      return {
        ...base,
        state: 'available',
        latestVersion,
        update: classifyDependencyUpdate(
          dependency.resolvedVersion,
          latestVersion,
        ),
      };
    } catch {
      return {
        ...base,
        state: 'unavailable',
        update: 'unknown',
        diagnostic: 'npm registry está indisponível ou excedeu o timeout.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
