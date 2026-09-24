import { DEV_CONTAINER_OWNERSHIP_LABEL } from './dev-container-up-adapter.js';

const MAX_OUTPUT_BYTES = 128 * 1024;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{12,128}$/u;
const OWNERSHIP_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface DevContainerDockerStructuredCommand {
  program: 'docker';
  args: readonly string[];
}

export type DevContainerOwnedContainerLookup =
  { state: 'absent' } | { state: 'present'; containerId: string };

export interface DevContainerOwnedContainerInspection {
  containerId: string;
  running: boolean;
}

export type DevContainerDockerCleanupAdapterErrorCode =
  | 'DEV_CONTAINER_DOCKER_INPUT_INVALID'
  | 'DEV_CONTAINER_DOCKER_OUTPUT_INVALID'
  | 'DEV_CONTAINER_DOCKER_OWNERSHIP_MISMATCH'
  | 'DEV_CONTAINER_DOCKER_OWNERSHIP_AMBIGUOUS';

export class DevContainerDockerCleanupAdapterError extends Error {
  public constructor(
    public readonly code: DevContainerDockerCleanupAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerDockerCleanupAdapterError';
  }
}

function validContainerId(value: unknown): value is string {
  return typeof value === 'string' && CONTAINER_ID_PATTERN.test(value);
}

function validOwnershipToken(value: unknown): value is string {
  return typeof value === 'string' && OWNERSHIP_TOKEN_PATTERN.test(value);
}

function boundedOutput(output: string): string {
  if (
    typeof output !== 'string' ||
    Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES
  ) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
      'A saída estruturada do Docker excedeu o limite seguro.',
    );
  }
  return output;
}

function requireContainerId(containerId: string): string {
  if (!validContainerId(containerId)) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_INPUT_INVALID',
      'O containerId de ownership do Dev Container é inválido.',
    );
  }
  return containerId;
}

function requireOwnershipToken(ownershipToken: string): string {
  if (!validOwnershipToken(ownershipToken)) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_INPUT_INVALID',
      'O token de ownership do Dev Container é inválido.',
    );
  }
  return ownershipToken;
}

export function buildFindDevContainerByOwnershipCommand(
  ownershipToken: string,
): DevContainerDockerStructuredCommand {
  const token = requireOwnershipToken(ownershipToken);
  return {
    program: 'docker',
    args: [
      'container',
      'ls',
      '--all',
      '--quiet',
      '--no-trunc',
      '--filter',
      'label=' + DEV_CONTAINER_OWNERSHIP_LABEL + '=' + token,
    ],
  };
}

export function parseOwnedDevContainerLookupOutput(
  output: string,
): DevContainerOwnedContainerLookup {
  const ids = boundedOutput(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (ids.some((id) => !validContainerId(id))) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
      'O Docker retornou um containerId inválido para o ownership.',
    );
  }

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { state: 'absent' };
  if (uniqueIds.length > 1) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OWNERSHIP_AMBIGUOUS',
      'Mais de um container corresponde ao mesmo ownership de Dev Container.',
    );
  }

  return { state: 'present', containerId: uniqueIds[0]! };
}

export function buildInspectOwnedDevContainerCommand(
  containerId: string,
): DevContainerDockerStructuredCommand {
  return {
    program: 'docker',
    args: ['inspect', '--type', 'container', requireContainerId(containerId)],
  };
}

export function parseOwnedDevContainerInspectOutput(
  output: string,
  expectedContainerId: string,
  ownershipToken: string,
): DevContainerOwnedContainerInspection {
  const containerId = requireContainerId(expectedContainerId);
  const token = requireOwnershipToken(ownershipToken);

  let parsed: unknown;
  try {
    parsed = JSON.parse(boundedOutput(output));
  } catch {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
      'O Docker retornou inspect em formato inválido.',
    );
  }

  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
      'O Docker não retornou exatamente um container no inspect.',
    );
  }

  const record = parsed[0];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
      'O inspect do Dev Container é inválido.',
    );
  }

  const inspected = record as Record<string, unknown>;
  if (inspected.Id !== containerId) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OWNERSHIP_MISMATCH',
      'O container inspecionado não corresponde ao containerId owned.',
    );
  }

  const config =
    inspected.Config && typeof inspected.Config === 'object'
      ? (inspected.Config as Record<string, unknown>)
      : undefined;
  const labels =
    config?.Labels && typeof config.Labels === 'object'
      ? (config.Labels as Record<string, unknown>)
      : undefined;

  if (labels?.[DEV_CONTAINER_OWNERSHIP_LABEL] !== token) {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OWNERSHIP_MISMATCH',
      'O container não possui o label de ownership esperado.',
    );
  }

  const state =
    inspected.State && typeof inspected.State === 'object'
      ? (inspected.State as Record<string, unknown>)
      : undefined;
  if (typeof state?.Running !== 'boolean') {
    throw new DevContainerDockerCleanupAdapterError(
      'DEV_CONTAINER_DOCKER_OUTPUT_INVALID',
      'O inspect não contém estado de execução válido.',
    );
  }

  return {
    containerId,
    running: state.Running,
  };
}

export function buildStopOwnedDevContainerCommand(
  containerId: string,
): DevContainerDockerStructuredCommand {
  return {
    program: 'docker',
    args: ['container', 'stop', requireContainerId(containerId)],
  };
}

export function buildRemoveOwnedDevContainerCommand(
  containerId: string,
): DevContainerDockerStructuredCommand {
  return {
    program: 'docker',
    args: ['container', 'rm', requireContainerId(containerId)],
  };
}
