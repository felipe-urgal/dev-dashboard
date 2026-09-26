import path from 'node:path';

const CONTAINER_ID_PATTERN = /^[a-f0-9]{12,128}$/u;
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export interface DevContainerExecCommand {
  file: 'devcontainer';
  args: readonly string[];
}

export function isValidDevContainerRuntimeId(
  runtimeId: string | undefined,
): runtimeId is string {
  return typeof runtimeId === 'string' && CONTAINER_ID_PATTERN.test(runtimeId);
}

function requireRuntimeId(runtimeId: string): void {
  if (!isValidDevContainerRuntimeId(runtimeId)) {
    throw new Error('Dev Container runtimeId inválido para execução.');
  }
}

function remoteWorkspaceCommand(
  workspaceFolder: string,
  command: string,
): string {
  if (!path.isAbsolute(command)) return command;

  const relative = path.relative(workspaceFolder, command);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      'Comando absoluto fora do workspace não pode executar no Dev Container.',
    );
  }

  return `./${relative.split(path.sep).join('/')}`;
}

export function buildDevContainerShellCommand(
  runtimeId: string,
): DevContainerExecCommand {
  requireRuntimeId(runtimeId);

  return {
    file: 'devcontainer',
    args: ['exec', '--container-id', runtimeId, '/bin/sh'],
  };
}

export interface DevContainerWorkspaceCommandOptions {
  runtimeId: string;
  workspaceFolder: string;
  command: string;
  args: readonly string[];
  remoteEnvironment?: Readonly<Record<string, string>>;
}

export function buildDevContainerWorkspaceCommand(
  options: DevContainerWorkspaceCommandOptions,
): DevContainerExecCommand {
  requireRuntimeId(options.runtimeId);
  if (!path.isAbsolute(options.workspaceFolder)) {
    throw new Error('Workspace do Dev Container precisa ser absoluto.');
  }
  if (!options.command) {
    throw new Error('Comando de teste do Dev Container ausente.');
  }

  const remoteEnvironment = Object.entries(options.remoteEnvironment ?? {});
  for (const [name] of remoteEnvironment) {
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error('Nome de variável remota inválido.');
    }
  }

  return {
    file: 'devcontainer',
    args: [
      'exec',
      '--container-id',
      options.runtimeId,
      '--workspace-folder',
      options.workspaceFolder,
      ...remoteEnvironment.flatMap(([name, value]) => [
        '--remote-env',
        `${name}=${value}`,
      ]),
      remoteWorkspaceCommand(options.workspaceFolder, options.command),
      ...options.args,
    ],
  };
}

export function buildDevContainerTestCommand(
  options: DevContainerWorkspaceCommandOptions,
): DevContainerExecCommand {
  return buildDevContainerWorkspaceCommand(options);
}
