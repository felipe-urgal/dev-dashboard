const CONTAINER_ID_PATTERN = /^[a-f0-9]{12,128}$/u;

export interface DevContainerShellCommand {
  file: 'devcontainer';
  args: readonly string[];
}

export function isValidDevContainerRuntimeId(
  runtimeId: string | undefined,
): runtimeId is string {
  return typeof runtimeId === 'string' && CONTAINER_ID_PATTERN.test(runtimeId);
}

export function buildDevContainerShellCommand(
  runtimeId: string,
): DevContainerShellCommand {
  if (!isValidDevContainerRuntimeId(runtimeId)) {
    throw new Error('Dev Container runtimeId inválido para execução.');
  }

  return {
    file: 'devcontainer',
    args: ['exec', '--container-id', runtimeId, '/bin/sh'],
  };
}
