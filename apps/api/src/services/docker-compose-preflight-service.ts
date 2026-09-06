import type {
  LocalPortEntry,
  LocalPortInspection,
  Project,
} from '@dev-dashboard/contracts';

import type {
  ComposeConfigSnapshot,
  ComposeRuntimeSnapshot,
} from './docker-compose-model.js';
import type {
  InspectLocalPortsInput,
  PortInspectorService,
} from './port-inspector-service.js';

const ACTIVE_RUNTIME_STATES = new Set(['running', 'restarting', 'paused']);

export type DockerComposePortPreflightState =
  'ready' | 'blocked' | 'unavailable';

export interface DockerComposePortConflict {
  port: number;
  services: string[];
  address: string;
  owner:
    | { kind: 'project'; projectId: string; processId: string }
    | { kind: 'external'; pid: number; name: string }
    | { kind: 'unknown' };
  suggestedPort?: number;
}

export interface DockerComposePortPreflight {
  state: DockerComposePortPreflightState;
  inspectedAt: string;
  conflicts: DockerComposePortConflict[];
  diagnostic?: string;
}

export type DockerComposePortPreflightInput = Omit<
  InspectLocalPortsInput,
  'declaredPorts' | 'projectNames'
> & {
  projectNames?: Readonly<Record<string, string>>;
};

type PortInspector = Pick<PortInspectorService, 'inspect'>;

function servicesByPublishedPort(
  config: ComposeConfigSnapshot,
): Map<number, string[]> {
  const grouped = new Map<number, string[]>();

  for (const service of config.services) {
    for (const binding of service.ports) {
      if (binding.publishedPort === undefined) continue;
      const current = grouped.get(binding.publishedPort) ?? [];
      if (!current.includes(service.name)) current.push(service.name);
      grouped.set(binding.publishedPort, current);
    }
  }

  for (const services of grouped.values()) services.sort();
  return grouped;
}

function activeRuntimeServicesByPort(
  runtime: ComposeRuntimeSnapshot | undefined,
): Map<number, Set<string>> {
  const grouped = new Map<number, Set<string>>();
  if (!runtime) return grouped;

  for (const service of runtime.services) {
    if (!ACTIVE_RUNTIME_STATES.has(service.state)) continue;
    for (const binding of service.ports) {
      if (binding.publishedPort === undefined) continue;
      const current = grouped.get(binding.publishedPort) ?? new Set<string>();
      current.add(service.service);
      grouped.set(binding.publishedPort, current);
    }
  }

  return grouped;
}

function isOwnedByCurrentCompose(
  port: number,
  expectedServices: readonly string[],
  runtimeServices: ReadonlyMap<number, Set<string>>,
): boolean {
  const owners = runtimeServices.get(port);
  return Boolean(
    owners && expectedServices.some((service) => owners.has(service)),
  );
}

function conflictOwner(
  entry: LocalPortEntry,
): DockerComposePortConflict['owner'] {
  if (entry.managedProcess) {
    return {
      kind: 'project',
      projectId: entry.managedProcess.projectId,
      processId: entry.managedProcess.id,
    };
  }
  if (entry.externalProcess) {
    return {
      kind: 'external',
      pid: entry.externalProcess.pid,
      name: entry.externalProcess.name,
    };
  }
  return { kind: 'unknown' };
}

function unavailable(
  inspection: LocalPortInspection,
  diagnostic?: string,
): DockerComposePortPreflight {
  return {
    state: 'unavailable',
    inspectedAt: inspection.inspectedAt,
    conflicts: [],
    diagnostic:
      diagnostic ??
      inspection.warning ??
      'Não foi possível comprovar a disponibilidade das portas do Docker Compose.',
  };
}

export class DockerComposePreflightService {
  public constructor(private readonly portInspector: PortInspector) {}

  public async inspect(
    project: Project,
    config: ComposeConfigSnapshot,
    runtime?: ComposeRuntimeSnapshot,
    input: DockerComposePortPreflightInput = {},
  ): Promise<DockerComposePortPreflight> {
    const composeServicesByPort = servicesByPublishedPort(config);
    const runtimeServicesByPort = activeRuntimeServicesByPort(runtime);

    let inspection: LocalPortInspection;
    try {
      inspection = await this.portInspector.inspect({
        ...input,
        projectNames: {
          ...(input.projectNames ?? {}),
          [project.id]: project.name,
        },
        declaredPorts: config.declaredPorts,
      });
    } catch {
      return {
        state: 'unavailable',
        inspectedAt: config.observedAt,
        conflicts: [],
        diagnostic:
          'O inspetor de portas falhou durante o preflight do Compose.',
      };
    }

    if (inspection.status !== 'ready') return unavailable(inspection);
    if (inspection.truncated) {
      return unavailable(
        inspection,
        'A inspeção de portas foi truncada; o Compose não pode assumir que o preflight está seguro.',
      );
    }

    const conflicts: DockerComposePortConflict[] = [];
    for (const entry of inspection.entries) {
      const services = composeServicesByPort.get(entry.port);
      if (!services || entry.state !== 'occupied') continue;
      if (
        isOwnedByCurrentCompose(entry.port, services, runtimeServicesByPort)
      ) {
        continue;
      }

      conflicts.push({
        port: entry.port,
        services: [...services],
        address: entry.address,
        owner: conflictOwner(entry),
        ...(entry.suggestedPort === undefined
          ? {}
          : { suggestedPort: entry.suggestedPort }),
      });
    }

    conflicts.sort((left, right) => left.port - right.port);
    return {
      state: conflicts.length > 0 ? 'blocked' : 'ready',
      inspectedAt: inspection.inspectedAt,
      conflicts,
      ...(conflicts.length > 0
        ? {
            diagnostic:
              'Uma ou mais portas publicadas pelo Docker Compose já estão ocupadas.',
          }
        : {}),
    };
  }
}
