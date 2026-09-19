import type {
  NodeDependencyInventory,
  NodeDependencyInventoryEntry,
} from './node-dependency-inventory-service.js';

const OSV_QUERY_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ADVISORIES_PER_DEPENDENCY = 1_000;
const MAX_ADVISORY_ID_LENGTH = 256;
const MAX_MODIFIED_LENGTH = 64;

export type OsvDependencyAdvisoryState =
  | 'available'
  | 'partial'
  | 'unknown-version'
  | 'unavailable'
  | 'invalid';

export interface OsvAdvisoryReference {
  id: string;
  modified: string;
}

export interface OsvDependencyAdvisoryEvidence {
  name: string;
  state: OsvDependencyAdvisoryState;
  source: 'osv';
  observedAt: string;
  resolvedVersion?: string;
  advisories: OsvAdvisoryReference[];
  complete: boolean;
  diagnostic?: string;
}

export interface OsvDependencyAdvisorySnapshot {
  inventory: NodeDependencyInventory;
  advisories: OsvDependencyAdvisoryEvidence[];
}

export type OsvFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface OsvDependencyAdvisoryServiceOptions {
  fetcher?: OsvFetch;
  now?: () => Date;
  timeoutMs?: number;
  batchSize?: number;
}

interface QueryTarget {
  dependency: NodeDependencyInventoryEntry;
  index: number;
  version: string;
}

interface ParsedQueryResult {
  state: 'available' | 'partial' | 'invalid';
  advisories: OsvAdvisoryReference[];
  complete: boolean;
  diagnostic?: string;
}

function safeExactVersion(
  dependency: NodeDependencyInventoryEntry,
): string | undefined {
  if (
    dependency.resolution !== 'resolved' ||
    typeof dependency.resolvedVersion !== 'string'
  ) {
    return undefined;
  }

  const version = dependency.resolvedVersion.trim();
  if (!version || version.length > 256 || version.includes('\0')) {
    return undefined;
  }
  return version;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validAdvisoryReference(value: unknown): OsvAdvisoryReference | undefined {
  if (!isObject(value)) return undefined;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const modified =
    typeof value.modified === 'string' ? value.modified.trim() : '';
  if (
    !id ||
    id.length > MAX_ADVISORY_ID_LENGTH ||
    id.includes('\0') ||
    !modified ||
    modified.length > MAX_MODIFIED_LENGTH ||
    modified.includes('\0') ||
    !Number.isFinite(Date.parse(modified))
  ) {
    return undefined;
  }
  return { id, modified };
}

function parseQueryResult(value: unknown): ParsedQueryResult {
  if (!isObject(value)) {
    return {
      state: 'invalid',
      advisories: [],
      complete: false,
      diagnostic: 'OSV retornou um resultado sem estrutura válida.',
    };
  }

  const rawVulns = value.vulns;
  if (rawVulns !== undefined && !Array.isArray(rawVulns)) {
    return {
      state: 'invalid',
      advisories: [],
      complete: false,
      diagnostic: 'OSV retornou advisories em formato inválido.',
    };
  }

  const rawItems = rawVulns ?? [];
  if (rawItems.length > MAX_ADVISORIES_PER_DEPENDENCY) {
    return {
      state: 'invalid',
      advisories: [],
      complete: false,
      diagnostic:
        'OSV retornou mais advisories do que o limite seguro por dependência.',
    };
  }

  const unique = new Map<string, OsvAdvisoryReference>();
  for (const item of rawItems) {
    const parsed = validAdvisoryReference(item);
    if (!parsed) {
      return {
        state: 'invalid',
        advisories: [],
        complete: false,
        diagnostic:
          'OSV retornou advisory sem id/modified válidos para auditoria.',
      };
    }
    unique.set(parsed.id, parsed);
  }

  const advisories = [...unique.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const nextPageToken =
    typeof value.next_page_token === 'string'
      ? value.next_page_token.trim()
      : '';
  if (
    value.next_page_token !== undefined &&
    typeof value.next_page_token !== 'string'
  ) {
    return {
      state: 'invalid',
      advisories: [],
      complete: false,
      diagnostic: 'OSV retornou paginação em formato inválido.',
    };
  }

  return nextPageToken
    ? {
        state: 'partial',
        advisories,
        complete: false,
        diagnostic:
          'OSV informou mais resultados; a evidência deste pacote permanece parcial.',
      }
    : { state: 'available', advisories, complete: true };
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

function unavailableEvidence(
  target: QueryTarget,
  observedAt: string,
  diagnostic: string,
): OsvDependencyAdvisoryEvidence {
  return {
    name: target.dependency.name,
    state: 'unavailable',
    source: 'osv',
    observedAt,
    resolvedVersion: target.version,
    advisories: [],
    complete: false,
    diagnostic,
  };
}

function invalidEvidence(
  target: QueryTarget,
  observedAt: string,
  diagnostic: string,
): OsvDependencyAdvisoryEvidence {
  return {
    name: target.dependency.name,
    state: 'invalid',
    source: 'osv',
    observedAt,
    resolvedVersion: target.version,
    advisories: [],
    complete: false,
    diagnostic,
  };
}

export class OsvDependencyAdvisoryService {
  private readonly fetcher: OsvFetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly batchSize: number;

  public constructor(options: OsvDependencyAdvisoryServiceOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = Math.max(10, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.batchSize = Math.min(
      MAX_BATCH_SIZE,
      Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE)),
    );
  }

  public async inspect(
    inventory: NodeDependencyInventory,
  ): Promise<OsvDependencyAdvisorySnapshot> {
    const observedAt = this.now().toISOString();
    const advisories = inventory.dependencies.map<OsvDependencyAdvisoryEvidence>(
      (dependency) => {
        const version = safeExactVersion(dependency);
        return version
          ? {
              name: dependency.name,
              state: 'unavailable',
              source: 'osv',
              observedAt,
              resolvedVersion: version,
              advisories: [],
              complete: false,
              diagnostic: 'Consulta OSV ainda não executada.',
            }
          : {
              name: dependency.name,
              state: 'unknown-version',
              source: 'osv',
              observedAt,
              advisories: [],
              complete: false,
              diagnostic:
                'A versão resolvida não foi comprovada; advisories não foram consultados.',
            };
      },
    );

    if (inventory.status !== 'ready' || inventory.dependencies.length === 0) {
      return { inventory, advisories };
    }

    const targets: QueryTarget[] = [];
    inventory.dependencies.forEach((dependency, index) => {
      const version = safeExactVersion(dependency);
      if (version) targets.push({ dependency, index, version });
    });

    for (let offset = 0; offset < targets.length; offset += this.batchSize) {
      const batch = targets.slice(offset, offset + this.batchSize);
      await this.inspectBatch(batch, advisories, observedAt);
    }

    return { inventory, advisories };
  }

  private async inspectBatch(
    targets: readonly QueryTarget[],
    destination: OsvDependencyAdvisoryEvidence[],
    observedAt: string,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();

    try {
      const response = await this.fetcher(OSV_QUERY_BATCH_URL, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queries: targets.map((target) => ({
            package: {
              ecosystem: 'npm',
              name: target.dependency.name,
            },
            version: target.version,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        for (const target of targets) {
          destination[target.index] = unavailableEvidence(
            target,
            observedAt,
            `OSV respondeu HTTP ${response.status}.`,
          );
        }
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(await boundedText(response)) as unknown;
      } catch {
        for (const target of targets) {
          destination[target.index] = invalidEvidence(
            target,
            observedAt,
            'Resposta OSV excedeu o limite ou possui JSON inválido.',
          );
        }
        return;
      }

      if (!isObject(payload) || !Array.isArray(payload.results)) {
        for (const target of targets) {
          destination[target.index] = invalidEvidence(
            target,
            observedAt,
            'OSV não retornou a coleção results esperada.',
          );
        }
        return;
      }
      if (payload.results.length !== targets.length) {
        for (const target of targets) {
          destination[target.index] = invalidEvidence(
            target,
            observedAt,
            'OSV retornou quantidade de resultados incompatível com o batch enviado.',
          );
        }
        return;
      }

      targets.forEach((target, index) => {
        const parsed = parseQueryResult(payload.results[index]);
        destination[target.index] = {
          name: target.dependency.name,
          state: parsed.state,
          source: 'osv',
          observedAt,
          resolvedVersion: target.version,
          advisories: parsed.advisories,
          complete: parsed.complete,
          ...(parsed.diagnostic ? { diagnostic: parsed.diagnostic } : {}),
        };
      });
    } catch {
      for (const target of targets) {
        destination[target.index] = unavailableEvidence(
          target,
          observedAt,
          'OSV está indisponível ou excedeu o timeout.',
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
