import { createHash } from 'node:crypto';

import type {
  ProjectServiceBinding,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
  ServiceLifecycleAction,
  ServiceLifecyclePlan,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { primaryEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ProjectServiceBindingStore } from '../store/project-service-binding-store.js';
import type { ServiceCatalogService } from './service-catalog-service.js';

const PLAN_TTL_MS = 30_000;
const MAX_NODES = 200;

interface Dependencies {
  bindings: Pick<ProjectServiceBindingStore, 'byProject' | 'byResource' | 'revision'>;
  projects: Pick<ProjectStore, 'findProject'>;
  environments: Pick<DevelopmentEnvironmentInstanceStore, 'findById'>;
  catalog: Pick<ServiceCatalogService, 'inspect'>;
}

function conflict(message: string): never {
  throw new ApiError({ statusCode: 409, code: 'CONFLICT', message });
}

function nodeForMissing(serviceRef: string): ServiceLifecyclePlanNode {
  return {
    serviceRef, name: serviceRef, provider: 'unknown',
    disposition: 'blocked', state: 'unknown', readiness: 'unknown',
    relation: 'missing', ports: [], consumerCount: 0, dependencies: [],
    diagnostic: 'Dependency is not bound to this environment.',
  };
}

function uniqueConsumers(bindings: readonly ProjectServiceBinding[]): number {
  return new Set(bindings.map((binding) =>
    binding.projectId + '\0' + binding.environmentInstanceId)).size;
}

function orderDependenciesFirst(
  nodes: ReadonlyMap<string, ServiceLifecyclePlanNode>,
): { order: string[]; cycle: boolean } {
  const visited = new Set<string>();
  const pending = new Set<string>();
  const ordered: string[] = [];
  let cycle = false;
  const walk = (ref: string): void => {
    if (pending.has(ref)) { cycle = true; return; }
    if (visited.has(ref)) return;
    pending.add(ref);
    for (const dependency of [...(nodes.get(ref)?.dependencies ?? [])].sort()) {
      if (nodes.has(dependency)) walk(dependency);
    }
    pending.delete(ref);
    visited.add(ref);
    ordered.push(ref);
  };
  for (const ref of [...nodes.keys()].sort()) walk(ref);
  return { order: ordered, cycle };
}

function matchingOwnership(
  entry: ServiceCatalogEntry,
  projectId: string,
  environmentInstanceId: string,
): boolean {
  return entry.ownership === 'confirmed' && entry.projectId === projectId &&
    (entry.environmentInstanceId ?? primaryEnvironmentInstanceId(projectId)) ===
    environmentInstanceId;
}

/** Explicitly observational. No lifecycle service or command runner is injected. */
export class ServiceLifecyclePlanningService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: Dependencies,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async preview(
    projectId: string,
    action: ServiceLifecycleAction,
    environmentInstanceId?: string,
    expectedPlanHash?: string,
  ): Promise<ServiceLifecyclePlan> {
    if (!this.dependencies.projects.findProject(projectId)) {
      throw new ApiError({
        statusCode: 404, code: 'NOT_FOUND', message: 'Project not found.',
      });
    }
    const id = environmentInstanceId ?? primaryEnvironmentInstanceId(projectId);
    const environment = this.dependencies.environments.findById(id);
    if (!environment || environment.projectId !== projectId) {
      throw new ApiError({
        statusCode: 404, code: 'NOT_FOUND', message: 'Environment not found for project.',
      });
    }
    if (environment.runtime.kind !== 'host') {
      conflict('Host service planning is unavailable inside a Dev Container.');
    }

    let catalog: ServiceCatalogSnapshot;
    try {
      catalog = await this.dependencies.catalog.inspect();
    } catch {
      conflict('Service observation is unavailable. No plan can be trusted.');
    }
    const expectedRevision = this.dependencies.bindings.revision(projectId);
    const all = this.dependencies.bindings.byProject(projectId);
    const bindings = all.filter((binding) =>
      binding.enabled && binding.environmentInstanceId === id);
    const diagnostics: string[] = [];
    if (catalog.status !== 'ready' || catalog.truncated ||
      catalog.providers.some((provider) => provider.status !== 'ready')) {
      diagnostics.push('Service and port observations are incomplete; execution must remain blocked.');
    }
    if (bindings.length === 0) {
      diagnostics.push('No enabled service bindings are configured for this environment.');
    }
    if (bindings.length > MAX_NODES) {
      conflict('Environment has too many services to safely plan.');
    }

    const observed = new Map(catalog.entries.map((entry) => [entry.id, entry]));
    const mapped = new Map<string, ServiceLifecyclePlanNode>();
    const desiredRefs = new Set(bindings.map((binding) => binding.serviceRef));
    for (const binding of bindings) {
      const entry = observed.get(binding.serviceRef);
      const consumers = uniqueConsumers(
        this.dependencies.bindings.byResource(binding.serviceRef));
      const shared = consumers > 1;
      const dependencies = [...new Set(binding.dependencies.map((item) =>
        item.serviceRef))].sort();
      const node: ServiceLifecyclePlanNode = {
        serviceRef: binding.serviceRef,
        name: entry?.name ?? binding.serviceRef,
        provider: entry?.provider ?? 'unknown',
        state: entry?.state ?? 'unknown',
        readiness: entry?.readiness ?? 'unknown',
        relation: binding.relation,
        ports: entry?.ports ?? [],
        consumerCount: consumers,
        dependencies,
        disposition: 'blocked',
      };
      if (!entry) {
        node.diagnostic = 'Service is absent from observed catalog (stale binding).';
      } else if (action === 'stop') {
        if (entry.state === 'stopped') {
          node.disposition = 'retained';
          node.diagnostic = 'Service is already stopped.';
        } else if (binding.relation !== 'owned' ||
          !matchingOwnership(entry, projectId, id)) {
          node.disposition = 'retained';
          node.diagnostic = 'Service is not exclusively owned by this environment.';
        } else if (shared) {
          node.disposition = 'retained';
          node.diagnostic = 'Another project or environment uses this service.';
        } else if (entry.provider === 'compose' || entry.provider === 'managed-process') {
          node.disposition = entry.state === 'running' ? 'willStop' : 'blocked';
          if (node.disposition === 'blocked') {
            node.diagnostic = 'Runtime state is not safely stoppable.';
          }
        } else {
          node.disposition = 'unsupported';
          node.diagnostic = 'No lifecycle adapter is authorized for this provider.';
        }
      } else if (entry.readiness === 'ready' && entry.state === 'running') {
        node.disposition = 'alreadyReady';
      } else if (entry.state === 'running' ||
        entry.state === 'starting' || entry.state === 'stopping' ||
        entry.state === 'failed' || entry.state === 'unknown' ||
        entry.readiness === 'unhealthy') {
        node.disposition = 'blocked';
        node.diagnostic = 'Readiness or a safe stopped state could not be proven.';
      } else if (binding.relation !== 'owned' ||
        !matchingOwnership(entry, projectId, id)) {
        node.disposition = 'blocked';
        node.diagnostic = 'Only a proven owner can initiate a stopped service.';
      } else if (entry.provider !== 'compose') {
        node.disposition = 'unsupported';
        node.diagnostic = 'Start requires an authorized lifecycle adapter; managed processes are not started by Stacks.';
      } else {
        node.disposition = 'willStart';
      }

      if (action === 'start' &&
        dependencies.some((dependency) => !desiredRefs.has(dependency))) {
        node.disposition = 'blocked';
        node.diagnostic = 'Declared dependency has no enabled binding in this environment.';
      }
      if (action === 'start' && node.disposition === 'willStart' &&
        node.ports.some((port) => catalog.ports.some((observedPort) =>
          observedPort.port === port))) {
        node.disposition = 'blocked';
        node.diagnostic = 'A declared host port is already occupied or conflicts with another service.';
      }
      if (node.ports.some((port) => catalog.ports.some((evidence) =>
        evidence.port === port && evidence.conflict))) {
        node.disposition = 'blocked';
        node.diagnostic = 'Port Inspector reports a conflict.';
      }
      mapped.set(binding.serviceRef, node);
    }
    // Show missing dependencies explicitly; never auto-bind or adopt them.
    for (const node of [...mapped.values()]) {
      for (const dependency of node.dependencies) {
        if (!mapped.has(dependency)) mapped.set(dependency, nodeForMissing(dependency));
      }
    }

    const topology = orderDependenciesFirst(mapped);
    if (topology.cycle) {
      diagnostics.push('Dependency graph contains a cycle.');
      for (const node of mapped.values()) {
        node.disposition = 'blocked';
        node.diagnostic = 'Dependency cycle prevents safe planning.';
      }
    }

    // Starting a node that depends on a blocked/unhealthy node must also block.
    if (action === 'start') {
      for (const ref of topology.order) {
        const node = mapped.get(ref)!;
        if (node.dependencies.some((dependency) => {
          const state = mapped.get(dependency)?.disposition;
          return state !== 'alreadyReady' && state !== 'willStart';
        })) {
          node.disposition = 'blocked';
          node.diagnostic = 'A dependency is blocked or its readiness is unknown.';
        }
      }
    }

    const order = action === 'start' ? topology.order : [...topology.order].reverse();
    const nodes = order.map((ref) => mapped.get(ref)!);
    if (nodes.some((node) =>
      node.disposition === 'blocked' || node.disposition === 'unsupported')) {
      diagnostics.push('One or more services cannot be safely operated.');
    }
    const observedAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + PLAN_TTL_MS).toISOString();
    const planHash = createHash('sha256').update(JSON.stringify({
      projectId, environmentInstanceId: id, action, expectedRevision,
      catalog, bindings, order, nodes,
    })).digest('hex');

    if (expectedPlanHash && expectedPlanHash !== planHash) {
      conflict('Lifecycle plan changed. Refresh the preview before retrying.');
    }

    return {
      target: { kind: 'project-environment', projectId, environmentInstanceId: id },
      action,
      status: diagnostics.length > 0 ? 'blocked' : 'ready',
      expectedRevision,
      planHash,
      observedAt,
      expiresAt,
      order,
      nodes,
      diagnostics,
      executable: false,
    };
  }
}
