import { execFile } from 'node:child_process';

import type {
  ProductionCommandStatusV1,
  Project,
} from '@dev-dashboard/contracts';

import {
  loadProductionCommandEnvironment,
  resolveProductionPackageManager,
  type ProductionPackageManager,
} from './command-adapter.js';
import { DeploymentError } from './errors.js';

export const PRODUCTION_STATUS_V1_PREFIX =
  'DEV_DASHBOARD_PRODUCTION_STATUS_V1=';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 16 * 1024;

export interface CommandProductionStatusReader {
  read(project: Project): Promise<ProductionCommandStatusV1>;
}

interface StatusCommandResult {
  stdout: string;
  exitCode: number;
  timedOut: boolean;
  outputExceeded: boolean;
}

type ExecuteStatusCommand = (request: {
  packageManager: ProductionPackageManager;
  projectPath: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
}) => Promise<StatusCommandResult>;

export interface PackageScriptProductionStatusReaderOptions {
  execute?: ExecuteStatusCommand;
  timeoutMs?: number;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const target = [...expected].sort();
  return (
    keys.length === target.length &&
    keys.every((key, index) => key === target[index])
  );
}

export function parseProductionCommandStatus(
  output: string,
): ProductionCommandStatusV1 {
  const payloads = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(PRODUCTION_STATUS_V1_PREFIX));

  if (payloads.length !== 1) {
    throw new DeploymentError(
      'DEPLOYMENT_COMMAND_STATUS_INVALID',
      'prod:status deve emitir exatamente uma linha de status v1 reconhecida pelo Dev Dashboard.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloads[0]!.slice(PRODUCTION_STATUS_V1_PREFIX.length));
  } catch {
    throw new DeploymentError(
      'DEPLOYMENT_COMMAND_STATUS_INVALID',
      'prod:status retornou JSON inválido para o protocolo de status v1.',
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !hasOnlyKeys(parsed as Record<string, unknown>, [
      'version',
      'revision',
      'state',
    ])
  ) {
    throw new DeploymentError(
      'DEPLOYMENT_COMMAND_STATUS_INVALID',
      'prod:status retornou shape inválido para o protocolo de status v1.',
    );
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.revision !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(record.revision) ||
    (record.state !== 'ready' &&
      record.state !== 'degraded' &&
      record.state !== 'unavailable')
  ) {
    throw new DeploymentError(
      'DEPLOYMENT_COMMAND_STATUS_INVALID',
      'prod:status retornou version, revision ou state inválido.',
    );
  }

  return {
    version: 1,
    revision: record.revision.toLowerCase(),
    state: record.state,
  };
}

function defaultExecuteStatusCommand(request: {
  packageManager: ProductionPackageManager;
  projectPath: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<StatusCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      request.packageManager,
      ['run', 'prod:status'],
      {
        cwd: request.projectPath,
        env: { ...process.env, ...request.environment },
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        shell: false,
        timeout: request.timeoutMs,
        killSignal: 'SIGTERM',
      },
      (error, stdout) => {
        if (!error) {
          resolve({
            stdout,
            exitCode: 0,
            timedOut: false,
            outputExceeded: false,
          });
          return;
        }

        const details = error as Error & {
          code?: string | number;
          killed?: boolean;
          signal?: NodeJS.Signals;
        };
        if (details.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          resolve({
            stdout: '',
            exitCode: 1,
            timedOut: false,
            outputExceeded: true,
          });
          return;
        }
        if (details.killed || details.signal === 'SIGTERM') {
          resolve({
            stdout: '',
            exitCode: 1,
            timedOut: true,
            outputExceeded: false,
          });
          return;
        }
        if (typeof details.code === 'number') {
          resolve({
            stdout,
            exitCode: details.code,
            timedOut: false,
            outputExceeded: false,
          });
          return;
        }
        reject(error);
      },
    );
  });
}

export class PackageScriptProductionStatusReader implements CommandProductionStatusReader {
  private readonly execute: ExecuteStatusCommand;
  private readonly timeoutMs: number;

  public constructor(options: PackageScriptProductionStatusReaderOptions = {}) {
    this.execute = options.execute ?? defaultExecuteStatusCommand;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async read(project: Project): Promise<ProductionCommandStatusV1> {
    if (
      project.production?.strategy !== 'command' ||
      project.production.commands.status !== 'prod:status'
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'O projeto não possui prod:status canônico disponível para leitura.',
      );
    }

    const packageManager = await resolveProductionPackageManager(project.path);
    const environment = await loadProductionCommandEnvironment(
      project.path,
      'production',
    );

    let result: StatusCommandResult;
    try {
      result = await this.execute({
        packageManager,
        projectPath: project.path,
        environment,
        timeoutMs: this.timeoutMs,
      });
    } catch {
      throw new DeploymentError(
        'DEPLOYMENT_COMMAND_STATUS_FAILED',
        'Não foi possível executar prod:status.',
      );
    }

    if (result.timedOut) {
      throw new DeploymentError(
        'DEPLOYMENT_COMMAND_STATUS_TIMEOUT',
        'prod:status excedeu o limite de tempo da leitura.',
      );
    }
    if (result.outputExceeded) {
      throw new DeploymentError(
        'DEPLOYMENT_COMMAND_STATUS_INVALID',
        'prod:status excedeu o limite de saída aceito.',
      );
    }
    if (result.exitCode !== 0) {
      throw new DeploymentError(
        'DEPLOYMENT_COMMAND_STATUS_FAILED',
        'prod:status terminou com falha.',
      );
    }

    return parseProductionCommandStatus(result.stdout);
  }
}
