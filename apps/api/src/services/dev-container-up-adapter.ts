import path from 'node:path';

import type { DevContainerConfigurationSource } from './dev-container-discovery-service.js';

const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_WORKSPACE_PATH_LENGTH = 4096;
const MAX_LABEL_LENGTH = 256;
const MAX_REMOTE_PATH_LENGTH = 4096;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{12,128}$/u;
const OWNERSHIP_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const DEV_CONTAINER_OWNERSHIP_LABEL = 'devdashboard.environment';

export interface DevContainerUpStructuredCommand {
  program: 'devcontainer';
  args: readonly string[];
}

export interface DevContainerUpCommandInput {
  workspaceFolder: string;
  configSource: DevContainerConfigurationSource;
  ownershipToken: string;
}

export type DevContainerUpEnvelope =
  | {
      outcome: 'success';
      containerId: string;
      remoteUser?: string;
      remoteWorkspaceFolder?: string;
      composeProjectName?: string;
    }
  | {
      outcome: 'error';
      containerId?: string;
      didStopContainer?: boolean;
    };

export type DevContainerUpAdapterErrorCode =
  | 'DEV_CONTAINER_UP_INPUT_INVALID'
  | 'DEV_CONTAINER_UP_OUTPUT_INVALID';

export class DevContainerUpAdapterError extends Error {
  public constructor(
    public readonly code: DevContainerUpAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerUpAdapterError';
  }
}

function validText(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes('\0') &&
    !value.includes('\n') &&
    !value.includes('\r')
  );
}

function optionalText(
  value: unknown,
  maxLength: number,
): string | undefined {
  return validText(value, maxLength) ? value : undefined;
}

function validConfigSource(
  value: unknown,
): value is DevContainerConfigurationSource {
  return (
    value === '.devcontainer/devcontainer.json' ||
    value === '.devcontainer.json'
  );
}

function validContainerId(value: unknown): value is string {
  return typeof value === 'string' && CONTAINER_ID_PATTERN.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function buildDevContainerUpCommand(
  input: DevContainerUpCommandInput,
): DevContainerUpStructuredCommand {
  if (
    !validText(input.workspaceFolder, MAX_WORKSPACE_PATH_LENGTH) ||
    !path.isAbsolute(input.workspaceFolder) ||
    !validConfigSource(input.configSource) ||
    !OWNERSHIP_TOKEN_PATTERN.test(input.ownershipToken)
  ) {
    throw new DevContainerUpAdapterError(
      'DEV_CONTAINER_UP_INPUT_INVALID',
      'O comando de criação do Dev Container não possui autoridade válida.',
    );
  }

  const workspaceFolder = path.resolve(input.workspaceFolder);
  const configPath = path.join(workspaceFolder, input.configSource);
  const ownershipLabel =
    DEV_CONTAINER_OWNERSHIP_LABEL + '=' + input.ownershipToken;

  if (ownershipLabel.length > MAX_LABEL_LENGTH) {
    throw new DevContainerUpAdapterError(
      'DEV_CONTAINER_UP_INPUT_INVALID',
      'O label interno de ownership do Dev Container é inválido.',
    );
  }

  return {
    program: 'devcontainer',
    args: [
      'up',
      '--workspace-folder',
      workspaceFolder,
      '--config',
      configPath,
      '--id-label',
      ownershipLabel,
      '--skip-post-create',
      '--no-lockfile',
      '--log-format',
      'json',
    ],
  };
}

function parseEnvelope(value: unknown): DevContainerUpEnvelope | undefined {
  const record = asRecord(value);
  if (!record || (record.outcome !== 'success' && record.outcome !== 'error')) {
    return undefined;
  }

  if (record.outcome === 'success') {
    if (!validContainerId(record.containerId)) {
      throw new DevContainerUpAdapterError(
        'DEV_CONTAINER_UP_OUTPUT_INVALID',
        'A Dev Container CLI não retornou um containerId válido.',
      );
    }

    const remoteUser = optionalText(record.remoteUser, MAX_LABEL_LENGTH);
    const remoteWorkspaceFolder = optionalText(
      record.remoteWorkspaceFolder,
      MAX_REMOTE_PATH_LENGTH,
    );
    const composeProjectName = optionalText(
      record.composeProjectName,
      MAX_LABEL_LENGTH,
    );

    return {
      outcome: 'success',
      containerId: record.containerId,
      ...(remoteUser ? { remoteUser } : {}),
      ...(remoteWorkspaceFolder ? { remoteWorkspaceFolder } : {}),
      ...(composeProjectName ? { composeProjectName } : {}),
    };
  }

  if (
    record.containerId !== undefined &&
    !validContainerId(record.containerId)
  ) {
    throw new DevContainerUpAdapterError(
      'DEV_CONTAINER_UP_OUTPUT_INVALID',
      'A Dev Container CLI retornou um containerId inválido em uma falha.',
    );
  }

  return {
    outcome: 'error',
    ...(validContainerId(record.containerId)
      ? { containerId: record.containerId }
      : {}),
    ...(typeof record.didStopContainer === 'boolean'
      ? { didStopContainer: record.didStopContainer }
      : {}),
  };
}

export function parseDevContainerUpOutput(
  output: string,
): DevContainerUpEnvelope {
  if (
    typeof output !== 'string' ||
    Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES
  ) {
    throw new DevContainerUpAdapterError(
      'DEV_CONTAINER_UP_OUTPUT_INVALID',
      'A saída da Dev Container CLI excedeu o limite seguro.',
    );
  }

  const lines = output.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const envelope = parseEnvelope(parsed);
    if (envelope) return envelope;
  }

  throw new DevContainerUpAdapterError(
    'DEV_CONTAINER_UP_OUTPUT_INVALID',
    'A Dev Container CLI não retornou um envelope estruturado de lifecycle.',
  );
}
