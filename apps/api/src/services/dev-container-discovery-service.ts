import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

const COMMAND_TIMEOUT_MS = 5_000;
const COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_LABEL_LENGTH = 256;

const CONFIG_CANDIDATES = [
  '.devcontainer/devcontainer.json',
  '.devcontainer.json',
] as const;

const DEFAULT_COMPOSE_FILES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
] as const;

const LIFECYCLE_HOOKS = [
  'initializeCommand',
  'onCreateCommand',
  'updateContentCommand',
  'postCreateCommand',
  'postStartCommand',
  'postAttachCommand',
] as const;

export type DevContainerConfigurationSource =
  (typeof CONFIG_CANDIDATES)[number];

export type DevContainerLifecycleHook = (typeof LIFECYCLE_HOOKS)[number];

export type DevContainerConfigurationKind =
  'image' | 'dockerfile' | 'compose' | 'unknown';

export type DevContainerInspectionState =
  | 'not-configured'
  | 'available'
  | 'cli-missing'
  | 'unavailable'
  | 'invalid-output';

export interface DevContainerConfigurationSummary {
  kind: DevContainerConfigurationKind;
  name?: string;
  service?: string;
  lifecycleHooks: DevContainerLifecycleHook[];
  /**
   * Evidência interna. Só é true quando dockerComposeFile resolve para um
   * único arquivo default na raiz do workspace, o mesmo domínio inspecionado
   * pelo DockerComposeProvider. O schema HTTP não expõe este campo.
   */
  composeUsesDefaultConfiguration?: boolean;
}

export interface DevContainerInspection {
  state: DevContainerInspectionState;
  observedAt: string;
  configSource?: DevContainerConfigurationSource;
  configurationHash?: string;
  cliVersion?: string;
  configuration?: DevContainerConfigurationSummary;
  diagnostic?: string;
}

export interface DevContainerStructuredCommand {
  program: 'devcontainer';
  args: readonly string[];
}

interface DevContainerCommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
}

export type DevContainerCommandRunner = (
  command: DevContainerStructuredCommand,
  options: DevContainerCommandOptions,
) => Promise<string>;

function defaultCommandRunner(
  command: DevContainerStructuredCommand,
  options: DevContainerCommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      command.args,
      {
        cwd: options.cwd,
        encoding: 'utf8',
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
}

function commandMissing(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_LABEL_LENGTH ||
    normalized.includes('\0')
  ) {
    return undefined;
  }

  return normalized;
}

function parseStructuredOutput(output: string): unknown {
  if (Buffer.byteLength(output, 'utf8') > COMMAND_MAX_BUFFER_BYTES) {
    throw new Error('Dev Container output exceeded the structured-data limit.');
  }

  return JSON.parse(output) as unknown;
}

function configurationRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Dev Container output is not an object.');
  }

  if (isRecord(value.configuration)) {
    return value.configuration;
  }

  return value;
}

function composeUsesDefaultConfiguration(
  configuration: Record<string, unknown>,
  projectPath: string,
  configSource: DevContainerConfigurationSource,
): boolean {
  const raw = configuration.dockerComposeFile;
  const files =
    typeof raw === 'string'
      ? [raw]
      : Array.isArray(raw) && raw.every((item) => typeof item === 'string')
        ? raw
        : [];

  if (files.length !== 1) return false;

  const configDirectory = path.dirname(path.join(projectPath, configSource));
  const candidate = path.resolve(configDirectory, files[0]!);
  return DEFAULT_COMPOSE_FILES.some(
    (file) => path.resolve(projectPath, file) === candidate,
  );
}

function summarizeConfiguration(
  value: unknown,
  projectPath: string,
  configSource: DevContainerConfigurationSource,
): DevContainerConfigurationSummary {
  const configuration = configurationRecord(value);

  let kind: DevContainerConfigurationKind = 'unknown';
  if (
    'dockerComposeFile' in configuration ||
    typeof configuration.service === 'string'
  ) {
    kind = 'compose';
  } else if ('dockerFile' in configuration || isRecord(configuration.build)) {
    kind = 'dockerfile';
  } else if (typeof configuration.image === 'string') {
    kind = 'image';
  }

  const lifecycleHooks = LIFECYCLE_HOOKS.filter(
    (hook) => configuration[hook] !== undefined,
  );
  const name = boundedLabel(configuration.name);
  const service = boundedLabel(configuration.service);

  return {
    kind,
    ...(name ? { name } : {}),
    ...(service ? { service } : {}),
    lifecycleHooks,
    ...(kind === 'compose'
      ? {
          composeUsesDefaultConfiguration: composeUsesDefaultConfiguration(
            configuration,
            projectPath,
            configSource,
          ),
        }
      : {}),
  };
}

async function findConfigurationSource(
  projectPath: string,
): Promise<DevContainerConfigurationSource | undefined> {
  for (const candidate of CONFIG_CANDIDATES) {
    try {
      const entry = await lstat(path.join(projectPath, candidate));
      if (entry.isFile()) {
        return candidate;
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        continue;
      }

      throw error;
    }
  }

  return undefined;
}

async function fingerprintConfiguration(
  projectPath: string,
  configSource: DevContainerConfigurationSource,
): Promise<string> {
  const target = path.join(projectPath, configSource);
  const before = await lstat(target);
  if (!before.isFile() || before.size > MAX_CONFIG_BYTES) {
    throw new Error('Dev Container config is not a bounded regular file.');
  }

  const handle = await open(target, 'r');
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.size > MAX_CONFIG_BYTES ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    ) {
      throw new Error('Dev Container config changed before it was opened.');
    }

    const content = await handle.readFile();
    const after = await handle.stat();
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs
    ) {
      throw new Error('Dev Container config changed while it was read.');
    }

    return createHash('sha256').update(content).digest('hex');
  } finally {
    await handle.close();
  }
}

function versionCommand(): DevContainerStructuredCommand {
  return {
    program: 'devcontainer',
    args: ['--version'],
  };
}

function readConfigurationCommand(
  workspaceFolder: string,
): DevContainerStructuredCommand {
  return {
    program: 'devcontainer',
    args: [
      'read-configuration',
      '--workspace-folder',
      workspaceFolder,
      '--include-configuration',
      '--log-format',
      'json',
    ],
  };
}

function normalizeVersion(output: string): string | undefined {
  const version = output.trim().split(/\r?\n/u)[0]?.trim();

  if (!version || version.length > MAX_LABEL_LENGTH || version.includes('\0')) {
    return undefined;
  }

  return version;
}

export class DevContainerDiscoveryService {
  public constructor(
    private readonly runCommand: DevContainerCommandRunner = defaultCommandRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async inspect(project: Project): Promise<DevContainerInspection> {
    const observedAt = this.now().toISOString();

    let configSource: DevContainerConfigurationSource | undefined;
    try {
      configSource = await findConfigurationSource(project.path);
    } catch {
      return {
        state: 'unavailable',
        observedAt,
        diagnostic:
          'A configuração Dev Container não pôde ser inspecionada com segurança.',
      };
    }

    if (!configSource) {
      return {
        state: 'not-configured',
        observedAt,
        diagnostic:
          'O projeto não possui .devcontainer/devcontainer.json nem .devcontainer.json.',
      };
    }

    const commandOptions = {
      cwd: project.path,
      timeoutMs: COMMAND_TIMEOUT_MS,
      maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
    } as const;

    let cliVersionOutput: string;
    try {
      cliVersionOutput = await this.runCommand(
        versionCommand(),
        commandOptions,
      );
    } catch (error) {
      return {
        state: commandMissing(error) ? 'cli-missing' : 'unavailable',
        observedAt,
        configSource,
        diagnostic: commandMissing(error)
          ? 'A Dev Container CLI não está disponível no PATH da API.'
          : 'A Dev Container CLI não pôde ser consultada.',
      };
    }

    const cliVersion = normalizeVersion(cliVersionOutput);
    if (!cliVersion) {
      return {
        state: 'invalid-output',
        observedAt,
        configSource,
        diagnostic:
          'A Dev Container CLI retornou uma versão em formato inválido.',
      };
    }

    let configurationHashBefore: string;
    try {
      configurationHashBefore = await fingerprintConfiguration(
        project.path,
        configSource,
      );
    } catch {
      return {
        state: 'unavailable',
        observedAt,
        configSource,
        cliVersion,
        diagnostic:
          'A configuração Dev Container mudou ou não pôde ser lida com segurança.',
      };
    }

    let configurationOutput: string;
    try {
      configurationOutput = await this.runCommand(
        readConfigurationCommand(project.path),
        commandOptions,
      );
    } catch {
      return {
        state: 'unavailable',
        observedAt,
        configSource,
        cliVersion,
        diagnostic:
          'A Dev Container CLI não pôde ler a configuração deste projeto.',
      };
    }

    let configurationHashAfter: string;
    try {
      configurationHashAfter = await fingerprintConfiguration(
        project.path,
        configSource,
      );
    } catch {
      return {
        state: 'unavailable',
        observedAt,
        configSource,
        cliVersion,
        diagnostic:
          'A configuração Dev Container mudou ou não pôde ser lida com segurança.',
      };
    }

    if (configurationHashBefore !== configurationHashAfter) {
      return {
        state: 'unavailable',
        observedAt,
        configSource,
        cliVersion,
        diagnostic:
          'A configuração Dev Container mudou durante o discovery; tente novamente.',
      };
    }

    try {
      const configuration = summarizeConfiguration(
        parseStructuredOutput(configurationOutput),
        project.path,
        configSource,
      );

      return {
        state: 'available',
        observedAt,
        configSource,
        configurationHash: configurationHashAfter,
        cliVersion,
        configuration,
      };
    } catch {
      return {
        state: 'invalid-output',
        observedAt,
        configSource,
        cliVersion,
        diagnostic:
          'A Dev Container CLI retornou uma configuração estruturada inválida.',
      };
    }
  }
}
