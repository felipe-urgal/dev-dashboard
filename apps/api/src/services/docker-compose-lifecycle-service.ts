import { execFile } from 'node:child_process';

import type { Project } from '@dev-dashboard/contracts';

import type { ComposeStructuredCommand } from './docker-compose-model.js';
import type {
  DockerComposeInspection,
  DockerComposeProvider,
} from './docker-compose-provider.js';
import type {
  DockerComposePortPreflight,
  DockerComposePortPreflightInput,
  DockerComposePreflightService,
} from './docker-compose-preflight-service.js';

const START_TIMEOUT_MS = 2 * 60_000;
const START_MAX_BUFFER_BYTES = 128 * 1024;

export type DockerComposeStartState = 'started' | 'started-unverified';

export interface DockerComposeStartResult {
  state: DockerComposeStartState;
  preflight: DockerComposePortPreflight;
  inspection?: DockerComposeInspection;
  diagnostic?: string;
}

export type DockerComposeLifecycleErrorCode =
  | 'COMPOSE_UNAVAILABLE'
  | 'COMPOSE_PREFLIGHT_BLOCKED'
  | 'COMPOSE_PREFLIGHT_UNAVAILABLE'
  | 'COMPOSE_START_FAILED';

export class DockerComposeLifecycleError extends Error {
  public constructor(
    public readonly code: DockerComposeLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DockerComposeLifecycleError';
  }
}

interface StartCommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
}

export type DockerComposeStartCommandRunner = (
  command: ComposeStructuredCommand,
  options: StartCommandOptions,
) => Promise<void>;

function defaultStartCommandRunner(
  command: ComposeStructuredCommand,
  options: StartCommandOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      command.args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        windowsHide: true,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
}

function startCommand(wait: boolean): ComposeStructuredCommand {
  return {
    program: 'docker',
    args: ['compose', 'up', '--detach', ...(wait ? ['--wait'] : [])],
  };
}

export interface DockerComposeLifecycleServiceOptions {
  supportsWait?: () => Promise<boolean>;
}

export class DockerComposeLifecycleService {
  private readonly supportsWait: () => Promise<boolean>;

  public constructor(
    private readonly provider: Pick<DockerComposeProvider, 'inspect'>,
    private readonly preflight: Pick<DockerComposePreflightService, 'inspect'>,
    private readonly runStart: DockerComposeStartCommandRunner =
      defaultStartCommandRunner,
    options: DockerComposeLifecycleServiceOptions = {},
  ) {
    this.supportsWait = options.supportsWait ?? (async () => false);
  }

  public async start(
    project: Project,
    preflightInput: DockerComposePortPreflightInput = {},
  ): Promise<DockerComposeStartResult> {
    const before = await this.provider.inspect(project);
    if (before.state !== 'available' || !before.config) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_UNAVAILABLE',
        before.diagnostic ??
          'Docker Compose não está disponível para iniciar este projeto.',
      );
    }

    const checked = await this.preflight.inspect(
      project,
      before.config,
      before.runtime,
      preflightInput,
    );
    if (checked.state === 'blocked') {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_BLOCKED',
        checked.diagnostic ??
          'Docker Compose não pode iniciar enquanto houver conflito de portas.',
      );
    }
    if (checked.state !== 'ready') {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_UNAVAILABLE',
        checked.diagnostic ??
          'Docker Compose não pode comprovar a segurança das portas publicadas.',
      );
    }

    let wait = false;
    try {
      wait = await this.supportsWait();
    } catch {
      wait = false;
    }

    try {
      await this.runStart(startCommand(wait), {
        cwd: project.path,
        timeoutMs: START_TIMEOUT_MS,
        maxBufferBytes: START_MAX_BUFFER_BYTES,
      });
    } catch {
      throw new DockerComposeLifecycleError(
        'COMPOSE_START_FAILED',
        'Docker Compose não conseguiu iniciar a stack conhecida deste projeto.',
      );
    }

    const after = await this.provider.inspect(project).catch(() => undefined);
    if (!after || after.state !== 'available' || !after.runtime) {
      return {
        state: 'started-unverified',
        preflight: checked,
        ...(after ? { inspection: after } : {}),
        diagnostic:
          'A operação de start terminou, mas o runtime não pôde ser comprovado na inspeção seguinte.',
      };
    }

    return { state: 'started', preflight: checked, inspection: after };
  }
}
