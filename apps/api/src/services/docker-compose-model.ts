import type { DeclaredProjectPort } from '@dev-dashboard/contracts';

import { declaredPortsFromResolvedCompose } from './port-registry-service.js';

export type ComposeServiceState =
  | 'running'
  | 'exited'
  | 'restarting'
  | 'created'
  | 'paused'
  | 'dead'
  | 'unknown';

export type ComposeServiceHealth =
  | 'healthy'
  | 'unhealthy'
  | 'starting'
  | 'none'
  | 'unknown';

export interface ComposePortBinding {
  targetPort: number;
  publishedPort?: number;
  protocol: 'tcp' | 'udp';
}

export interface ComposeServiceDefinition {
  name: string;
  image?: string;
  profiles: string[];
  dependsOn: string[];
  ports: ComposePortBinding[];
}

export interface ComposeConfigSnapshot {
  projectName?: string;
  observedAt: string;
  services: ComposeServiceDefinition[];
  declaredPorts: DeclaredProjectPort[];
}

export interface ComposeServiceRuntime {
  service: string;
  containerId?: string;
  containerName?: string;
  state: ComposeServiceState;
  health: ComposeServiceHealth;
  exitCode?: number;
  ports: ComposePortBinding[];
}

export interface ComposeRuntimeSnapshot {
  observedAt: string;
  services: ComposeServiceRuntime[];
}

export interface ComposeStructuredCommand {
  program: 'docker';
  args: string[];
}

const MAX_SERVICES = 256;
const MAX_PORTS_PER_SERVICE = 64;
const MAX_NAME_LENGTH = 128;
const MAX_IMAGE_LENGTH = 512;
const MAX_CONTAINER_NAME_LENGTH = 256;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function portNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{1,5}$/u.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535
    ? parsed
    : undefined;
}

function protocol(value: unknown): 'tcp' | 'udp' {
  return boundedString(value, 8)?.toLowerCase() === 'udp' ? 'udp' : 'tcp';
}

function parsePortBindings(value: unknown, runtime = false): ComposePortBinding[] {
  if (!Array.isArray(value)) return [];
  const bindings: ComposePortBinding[] = [];

  for (const candidate of value) {
    if (bindings.length >= MAX_PORTS_PER_SERVICE) break;
    if (!isRecord(candidate)) continue;

    const targetPort = portNumber(runtime ? candidate.TargetPort : candidate.target);
    const publishedPort = portNumber(runtime ? candidate.PublishedPort : candidate.published);
    if (targetPort === undefined) continue;

    bindings.push({
      targetPort,
      ...(publishedPort === undefined ? {} : { publishedPort }),
      protocol: protocol(runtime ? candidate.Protocol : candidate.protocol),
    });
  }

  return bindings;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((candidate) => {
        const item = boundedString(candidate, MAX_NAME_LENGTH);
        return item ? [item] : [];
      }),
    ),
  ];
}

function dependsOn(value: unknown): string[] {
  if (Array.isArray(value)) return stringList(value);
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .map((item) => boundedString(item, MAX_NAME_LENGTH))
    .filter((item): item is string => item !== undefined)
    .sort();
}

function serviceState(value: unknown): ComposeServiceState {
  switch (boundedString(value, 32)?.toLowerCase()) {
    case 'running':
    case 'exited':
    case 'restarting':
    case 'created':
    case 'paused':
    case 'dead':
      return boundedString(value, 32)!.toLowerCase() as ComposeServiceState;
    default:
      return 'unknown';
  }
}

function serviceHealth(value: unknown): ComposeServiceHealth {
  switch (boundedString(value, 32)?.toLowerCase()) {
    case 'healthy':
      return 'healthy';
    case 'unhealthy':
      return 'unhealthy';
    case 'starting':
      return 'starting';
    case '':
    case undefined:
      return 'none';
    default:
      return 'unknown';
  }
}

function exitCode(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function parseComposeConfig(
  payload: unknown,
  projectId: string,
  observedAt: string,
): ComposeConfigSnapshot {
  if (!isRecord(payload) || !isRecord(payload.services)) {
    throw new Error('Configuração resolvida do Docker Compose é inválida.');
  }

  const services: ComposeServiceDefinition[] = [];
  const publishedPorts: Array<{ service: string; publishedPort: number }> = [];

  for (const [rawName, rawService] of Object.entries(payload.services)) {
    if (services.length >= MAX_SERVICES) break;
    const name = boundedString(rawName, MAX_NAME_LENGTH);
    if (!name || !isRecord(rawService)) continue;

    const ports = parsePortBindings(rawService.ports);
    services.push({
      name,
      ...(boundedString(rawService.image, MAX_IMAGE_LENGTH)
        ? { image: boundedString(rawService.image, MAX_IMAGE_LENGTH) }
        : {}),
      profiles: stringList(rawService.profiles),
      dependsOn: dependsOn(rawService.depends_on),
      ports,
    });

    for (const binding of ports) {
      if (binding.publishedPort === undefined) continue;
      publishedPorts.push({ service: name, publishedPort: binding.publishedPort });
    }
  }

  const projectName = boundedString(payload.name, MAX_NAME_LENGTH);
  return {
    ...(projectName ? { projectName } : {}),
    observedAt,
    services,
    declaredPorts: declaredPortsFromResolvedCompose(projectId, publishedPorts),
  };
}

export function parseComposePs(
  payload: unknown,
  observedAt: string,
): ComposeRuntimeSnapshot {
  if (!Array.isArray(payload)) {
    throw new Error('Estado do Docker Compose é inválido.');
  }

  const services: ComposeServiceRuntime[] = [];
  for (const candidate of payload) {
    if (services.length >= MAX_SERVICES) break;
    if (!isRecord(candidate)) continue;
    const service = boundedString(candidate.Service, MAX_NAME_LENGTH);
    if (!service) continue;

    const containerId = boundedString(candidate.ID, MAX_NAME_LENGTH);
    const containerName = boundedString(candidate.Name, MAX_CONTAINER_NAME_LENGTH);
    const code = exitCode(candidate.ExitCode);
    services.push({
      service,
      ...(containerId ? { containerId } : {}),
      ...(containerName ? { containerName } : {}),
      state: serviceState(candidate.State),
      health: serviceHealth(candidate.Health),
      ...(code === undefined ? {} : { exitCode: code }),
      ports: parsePortBindings(candidate.Publishers, true),
    });
  }

  return { observedAt, services };
}

export function buildComposeConfigCommand(): ComposeStructuredCommand {
  return {
    program: 'docker',
    args: ['compose', 'config', '--format', 'json'],
  };
}

export function buildComposePsCommand(): ComposeStructuredCommand {
  return {
    program: 'docker',
    args: ['compose', 'ps', '--all', '--format', 'json'],
  };
}
