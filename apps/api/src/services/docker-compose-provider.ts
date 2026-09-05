import { execFile } from 'node:child_process';

import type { Project } from '@dev-dashboard/contracts';

import {
  buildComposeConfigCommand,
  buildComposePsCommand,
  parseComposeConfig,
  parseComposePs,
  type ComposeConfigSnapshot,
  type ComposeRuntimeSnapshot,
  type ComposeStructuredCommand,
} from './docker-compose-model.js';

const COMMAND_TIMEOUT_MS = 5_000;
const COMMAND_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

export type DockerComposeInspectionState =
  | 'available'
  | 'runtime-unavailable'
  | 'docker-missing'
  | 'compose-unavailable'
  | 'invalid-output';

export interface DockerComposeInspection {
  state: DockerComposeInspectionState;
  observedAt: string;
  config?: ComposeConfigSnapshot;
  runtime?: ComposeRuntimeSnapshot;
  diagnostic?: string;
}

interface ComposeCommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
}

export type ComposeCommandRunner = (
  command: ComposeStructuredCommand,
  options: ComposeCommandOptions,
) => Promise<string>;

function defaultCommandRunner(
  command: ComposeStructuredCommand,
  options: ComposeCommandOptions,
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

function parseJson(value: string): unknown {
  if (Buffer.byteLength(value, 'utf8') > COMMAND_MAX_BUFFER_BYTES) {
    throw new Error('Saída estruturada do Docker Compose excedeu o limite.');
  }
  return JSON.parse(value) as unknown;
}

export class DockerComposeProvider {
  public constructor(
    private readonly runCommand: ComposeCommandRunner = defaultCommandRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async inspect(project: Project): Promise<DockerComposeInspection> {
    const observedAt = this.now().toISOString();
    const commandOptions = {
      cwd: project.path,
      timeoutMs: COMMAND_TIMEOUT_MS,
      maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
    } as const;

    let configOutput: string;
    try {
      configOutput = await this.runCommand(
        buildComposeConfigCommand(),
        commandOptions,
      );
    } catch (error) {
      return {
        state: commandMissing(error) ? 'docker-missing' : 'compose-unavailable',
        observedAt,
        diagnostic: commandMissing(error)
          ? 'Docker não está disponível no PATH da API.'
          : 'Docker Compose não pôde validar a configuração deste projeto.',
      };
    }

    let config: ComposeConfigSnapshot;
    try {
      config = parseComposeConfig(
        parseJson(configOutput),
        project.id,
        observedAt,
      );
    } catch {
      return {
        state: 'invalid-output',
        observedAt,
        diagnostic:
          'Docker Compose retornou uma configuração estruturada inválida.',
      };
    }

    let runtimeOutput: string;
    try {
      runtimeOutput = await this.runCommand(
        buildComposePsCommand(),
        commandOptions,
      );
    } catch {
      return {
        state: 'runtime-unavailable',
        observedAt,
        config,
        diagnostic:
          'A configuração Compose é válida, mas o estado dos containers não pôde ser consultado.',
      };
    }

    let runtime: ComposeRuntimeSnapshot;
    try {
      runtime = parseComposePs(parseJson(runtimeOutput), observedAt);
    } catch {
      return {
        state: 'invalid-output',
        observedAt,
        config,
        diagnostic:
          'Docker Compose retornou um estado de runtime estruturado inválido.',
      };
    }

    return { state: 'available', observedAt, config, runtime };
  }
}
