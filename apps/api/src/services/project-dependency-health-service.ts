import type { Project } from '@dev-dashboard/contracts';

import {
  NodeDependencyInventoryService,
  type NodeDependencyInventory,
} from './node-dependency-inventory-service.js';
import {
  NodeRuntimeDiscoveryService,
  type NodeRuntimeDiscovery,
} from './node-runtime-discovery-service.js';
import {
  NpmDependencyMetadataService,
  type NpmDependencyMetadata,
} from './npm-dependency-metadata-service.js';
import {
  OsvDependencyAdvisoryService,
  type OsvDependencyAdvisoryEvidence,
} from './osv-dependency-advisory-service.js';

export interface ProjectDependencyHealthSnapshot {
  generatedAt: string;
  inventory: NodeDependencyInventory;
  runtime: NodeRuntimeDiscovery;
  metadata: NpmDependencyMetadata[];
  advisories: OsvDependencyAdvisoryEvidence[];
}

export interface ProjectDependencyHealthServiceOptions {
  now?: () => Date;
  cacheTtlMs?: number;
  inventoryService?: Pick<NodeDependencyInventoryService, 'inspect'>;
  runtimeDiscoveryService?: Pick<NodeRuntimeDiscoveryService, 'inspect'>;
  metadataService?: Pick<NpmDependencyMetadataService, 'enrich'>;
  advisoryService?: Pick<OsvDependencyAdvisoryService, 'inspect'>;
}

function unavailableInventory(
  project: Project,
  observedAt: string,
): NodeDependencyInventory {
  return {
    status: 'unavailable',
    projectId: project.id,
    packageManager: 'unknown',
    observedAt,
    lockfile: 'missing',
    dependencies: [],
    warnings: [
      'O inventário local de dependências não pôde ser consultado nesta atualização.',
    ],
  };
}

function unavailableRuntime(observedAt: string): NodeRuntimeDiscovery {
  return {
    state: 'invalid',
    observedAt,
    declarations: [],
    diagnostic:
      'A declaração de runtime Node não pôde ser consultada nesta atualização.',
  };
}

function unavailableMetadata(
  inventory: NodeDependencyInventory,
  runtimeVersion: string | undefined,
  observedAt: string,
): NpmDependencyMetadata[] {
  return inventory.dependencies.map((dependency) => ({
    name: dependency.name,
    state: 'unavailable',
    source: 'npm-registry',
    observedAt,
    ...(runtimeVersion ? { runtimeVersion } : {}),
    latestRuntimeCompatibility: 'unknown',
    update: 'unknown',
    diagnostic:
      'A metadata externa do npm não pôde ser consultada nesta atualização.',
  }));
}

function unavailableAdvisories(
  inventory: NodeDependencyInventory,
  observedAt: string,
): OsvDependencyAdvisoryEvidence[] {
  return inventory.dependencies.map((dependency) => {
    const resolvedVersion =
      dependency.resolution === 'resolved'
        ? dependency.resolvedVersion
        : undefined;
    return resolvedVersion
      ? {
          name: dependency.name,
          state: 'unavailable',
          source: 'osv',
          observedAt,
          resolvedVersion,
          advisories: [],
          complete: false,
          diagnostic:
            'A evidência de advisories OSV não pôde ser consultada nesta atualização.',
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
  });
}

const DEFAULT_CACHE_TTL_MS = 30_000;

export class ProjectDependencyHealthService {
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: Promise<ProjectDependencyHealthSnapshot> }
  >();
  private readonly inventoryService: Pick<
    NodeDependencyInventoryService,
    'inspect'
  >;
  private readonly runtimeDiscoveryService: Pick<
    NodeRuntimeDiscoveryService,
    'inspect'
  >;
  private readonly metadataService: Pick<
    NpmDependencyMetadataService,
    'enrich'
  >;
  private readonly advisoryService: Pick<
    OsvDependencyAdvisoryService,
    'inspect'
  >;

  public constructor(options: ProjectDependencyHealthServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.inventoryService =
      options.inventoryService ?? new NodeDependencyInventoryService(this.now);
    this.runtimeDiscoveryService =
      options.runtimeDiscoveryService ??
      new NodeRuntimeDiscoveryService({ now: this.now });
    this.metadataService =
      options.metadataService ??
      new NpmDependencyMetadataService({ now: this.now });
    this.advisoryService =
      options.advisoryService ??
      new OsvDependencyAdvisoryService({ now: this.now });
  }

  public inspect(
    project: Project,
    options: { refresh?: boolean } = {},
  ): Promise<ProjectDependencyHealthSnapshot> {
    const key = `${project.id}\0${project.path}`;
    const now = this.now().getTime();
    const cached = this.cache.get(key);
    if (!options.refresh && cached && cached.expiresAt > now) {
      return cached.value;
    }

    const value = this.inspectFresh(project);
    this.cache.set(key, {
      expiresAt: now + this.cacheTtlMs,
      value,
    });
    void value.catch(() => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    });
    return value;
  }

  private async inspectFresh(
    project: Project,
  ): Promise<ProjectDependencyHealthSnapshot> {
    const generatedAt = this.now().toISOString();

    const [inventoryResult, runtimeResult] = await Promise.allSettled([
      this.inventoryService.inspect(project),
      this.runtimeDiscoveryService.inspect(project),
    ]);
    const inventory =
      inventoryResult.status === 'fulfilled'
        ? inventoryResult.value
        : unavailableInventory(project, generatedAt);
    const runtime =
      runtimeResult.status === 'fulfilled'
        ? runtimeResult.value
        : unavailableRuntime(generatedAt);
    const runtimeVersion =
      runtime.state === 'declared' ? runtime.version : undefined;

    const [metadataResult, advisoryResult] = await Promise.allSettled([
      this.metadataService.enrich(inventory, runtimeVersion),
      this.advisoryService.inspect(inventory),
    ]);

    return {
      generatedAt,
      inventory,
      runtime,
      metadata:
        metadataResult.status === 'fulfilled'
          ? metadataResult.value.metadata
          : unavailableMetadata(inventory, runtimeVersion, generatedAt),
      advisories:
        advisoryResult.status === 'fulfilled'
          ? advisoryResult.value.advisories
          : unavailableAdvisories(inventory, generatedAt),
    };
  }
}
