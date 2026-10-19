import type {
  ManagedProcess,
  Project,
  ServiceCatalogEntry,
  ServiceCatalogProviderStatus,
  ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';

import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { ProjectStore } from '../store/project-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';
import type { DockerComposeOwnershipStore } from './docker-compose-ownership-store.js';
import type { PortInspectorService } from './port-inspector-service.js';
import type { SystemdServiceInventory } from './systemd-service-inventory.js';
import type { DockerContainerObserver } from './docker-container-observer.js';

const MAX_ENTRIES = 250;
const MAX_PROJECTS = 12;

type CatalogDependencies = {
  systemd: Pick<SystemdServiceInventory, 'inspect'>;
  containers: Pick<DockerContainerObserver, 'inspect'>;
  processManager: Pick<ProcessManager, 'listProcesses'>;
  portInspector: Pick<PortInspectorService, 'inspect'>;
  projectStore: Pick<ProjectStore, 'listProjects'>;
  composeProvider: Pick<DockerComposeProvider, 'inspect'>;
  composeOwnership: Pick<DockerComposeOwnershipStore, 'get'>;
};

function processState(value: ManagedProcess['status']): ServiceCatalogEntry['state'] {
  return value;
}

function composeState(value: string): ServiceCatalogEntry['state'] {
  if (value === 'running') return 'running';
  if (value === 'restarting') return 'starting';
  if (value === 'exited' || value === 'created' || value === 'paused') return 'stopped';
  if (value === 'dead') return 'failed';
  return 'unknown';
}

export class ServiceCatalogService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: CatalogDependencies,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async inspect(): Promise<ServiceCatalogSnapshot> {
    const observedAt = this.now().toISOString();
    const providers: ServiceCatalogProviderStatus[] = [];
    const entries: ServiceCatalogEntry[] = [];
    let truncated = false;

    const [systemdResult, containersResult, processesResult] = await Promise.allSettled([
      this.dependencies.systemd.inspect(),
      this.dependencies.containers.inspect(),
      this.dependencies.processManager.listProcesses(),
    ]);

    if (systemdResult.status === 'fulfilled') {
      const snapshot = systemdResult.value;
      providers.push({
        provider: 'systemd',
        status: snapshot.status,
        ...(snapshot.status !== 'ready'
          ? { diagnostic: 'Systemd observation is partial or unavailable.' }
          : {}),
      });
      truncated ||= snapshot.truncated;
      for (const service of snapshot.services) {
        entries.push({
          id: service.id,
          provider: 'systemd',
          name: service.name,
          scope: service.scope,
          state: service.state,
          readiness: 'unknown',
          ownership: 'unmanaged',
          ports: [],
          observedAt: service.observedAt,
          ...(service.diagnostic ? { diagnostic: service.diagnostic } : {}),
        });
      }
    } else {
      providers.push({ provider: 'systemd', status: 'unavailable',
        diagnostic: 'Systemd observation failed.' });
    }

    const processes = processesResult.status === 'fulfilled' ? processesResult.value : [];
    if (processesResult.status === 'fulfilled') {
      providers.push({ provider: 'managed-process', status: 'ready' });
      for (const process of processes) {
        // A Process Manager record proves management by the Dashboard only.
        entries.push({
          id: 'process:' + process.id,
          provider: 'managed-process',
          name: process.kind + ' · ' + process.id,
          state: processState(process.status),
          readiness: 'unknown',
          ownership: 'confirmed',
          scope: 'environment',
          projectId: process.projectId,
          ...(process.environmentInstanceId
            ? { environmentInstanceId: process.environmentInstanceId }
            : {}),
          ports: [],
          observedAt,
        });
      }
    } else {
      providers.push({ provider: 'managed-process', status: 'unavailable',
        diagnostic: 'Managed processes could not be inspected.' });
    }

    let ownedContainerIds = new Set<string>();
    let composeStatus: ServiceCatalogProviderStatus['status'] = 'ready';
    const projects: Project[] = this.dependencies.projectStore.listProjects();
    if (projects.length > MAX_PROJECTS) {
      truncated = true;
      composeStatus = 'partial';
    }
    const composeObservations = await Promise.all(
      projects.slice(0, MAX_PROJECTS).map(async (project) => {
        try {
          const owner = await this.dependencies.composeOwnership.get(project);
          if (!owner) return { status: 'ready' as const, entries: [] as ServiceCatalogEntry[],
            containerIds: [] as string[] };
          const observation = await this.dependencies.composeProvider.inspect(project);
          if (observation.state !== 'available' || !observation.runtime ||
            !observation.config || observation.config.projectName !== owner.composeProjectName) {
            return { status: 'partial' as const, entries: [] as ServiceCatalogEntry[],
              containerIds: [] as string[] };
          }
          const knownServices = new Set(observation.config.services.map((s) => s.name));
          const composed: ServiceCatalogEntry[] = [];
          const ids: string[] = [];
          for (const runtime of observation.runtime.services) {
            if (!knownServices.has(runtime.service)) continue;
            if (runtime.containerId && /^[a-f0-9]{12,64}$/.test(runtime.containerId)) {
              ids.push(runtime.containerId);
            }
            const state = composeState(runtime.state);
            composed.push({
              id: 'compose:' + project.id + ':' + runtime.service,
              provider: 'compose',
              name: runtime.service,
              state,
              readiness: state === 'running' && runtime.health === 'healthy'
                ? 'ready' : runtime.health === 'unhealthy' ? 'unhealthy' : 'unknown',
              ownership: 'confirmed',
              scope: 'environment',
              projectId: project.id,
              ports: runtime.ports.flatMap((port) =>
                port.publishedPort ? [port.publishedPort] : []),
              observedAt: observation.observedAt,
            });
          }
          return { status: 'ready' as const, entries: composed, containerIds: ids };
        } catch {
          return { status: 'partial' as const, entries: [] as ServiceCatalogEntry[],
            containerIds: [] as string[] };
        }
      }),
    );
    for (const result of composeObservations) {
      if (result.status !== 'ready') composeStatus = 'partial';
      entries.push(...result.entries);
      for (const id of result.containerIds) ownedContainerIds.add(id);
    }
    providers.push({ provider: 'compose', status: composeStatus,
      ...(composeStatus !== 'ready'
        ? { diagnostic: 'One or more owned Compose projects could not be proven.' }
        : {}),
    });

    if (containersResult.status === 'fulfilled') {
      const snapshot = containersResult.value;
      providers.push({
        provider: 'docker', status: snapshot.status,
        ...(snapshot.status !== 'ready'
          ? { diagnostic: 'Docker container observation unavailable.' } : {}),
      });
      truncated ||= snapshot.truncated;
      for (const container of snapshot.containers) {
        if ([...ownedContainerIds].some((id) =>
          id === container.id || (id.length > 12 && container.id.startsWith(id)))) continue;
        entries.push({
          id: 'docker:' + container.id,
          provider: 'docker',
          name: container.name,
          state: container.state,
          readiness: 'unknown',
          ownership: 'unmanaged',
          scope: 'host',
          ports: [],
          observedAt,
        });
      }
    } else {
      providers.push({ provider: 'docker', status: 'unavailable',
        diagnostic: 'Docker container observation failed.' });
    }

    const ports = [];
    try {
      const inspection = await this.dependencies.portInspector.inspect({ managedProcesses: processes });
      providers.push({
        provider: 'ports',
        status: inspection.status === 'ready'
          ? 'ready' : inspection.status === 'unsupported' ? 'unsupported' : 'unavailable',
        ...(inspection.warning ? { diagnostic: inspection.warning } : {}),
      });
      truncated ||= inspection.truncated;
      for (const entry of inspection.entries) {
        if (entry.state !== 'occupied') continue;
        ports.push({
          port: entry.port,
          address: entry.address,
          conflict: entry.conflict,
          ...(entry.managedProcess
            ? { managedProcessId: entry.managedProcess.id } : {}),
        });
        // Only the Port Inspector's verified process identity permits correlation.
        const matching = entries.find((candidate) =>
          candidate.provider === 'managed-process' &&
          candidate.id === 'process:' + entry.managedProcess?.id &&
          candidate.projectId === entry.managedProcess?.projectId);
        if (matching && !matching.ports.includes(entry.port)) matching.ports.push(entry.port);
      }
    } catch {
      providers.push({
        provider: 'ports', status: 'unavailable',
        diagnostic: 'Port observation failed.',
      });
    }

    entries.sort((a, b) => a.id.localeCompare(b.id));
    if (entries.length > MAX_ENTRIES) {
      truncated = true;
      entries.length = MAX_ENTRIES;
    }
    const available = providers.filter((provider) => provider.status === 'ready');
    const status = providers.every((provider) => provider.status === 'unsupported')
      ? 'unsupported'
      : available.length === 0 ? 'unavailable'
        : available.length === providers.length && !truncated ? 'ready' : 'partial';
    return {
      status,
      observedAt,
      entries,
      ports: ports.slice(0, 100),
      providers,
      truncated: truncated || ports.length > 100,
    };
  }
}
