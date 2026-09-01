import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import type {
  DeploymentPlanStep,
  ProductionCommandId,
  Project,
} from '@dev-dashboard/contracts';
import {
  maskSensitiveLogContent,
  type MaskedLogContent,
} from '@dev-dashboard/process-manager';

import {
  loadProjectLocalEnvironment,
  ProjectLocalEnvironmentError,
  type ProjectLocalEnvironmentKind,
} from '../security/project-local-environment.js';
import { DeploymentError } from './errors.js';
import { VercelProviderStepAdapter } from './step-adapter.js';

const SCRIPT_BY_COMMAND = {
  status: 'prod:status',
  check: 'prod:check',
  backup: 'prod:backup',
  migrate: 'prod:migrate',
  deploy: 'prod:deploy',
  verify: 'prod:verify',
  restoreCheck: 'prod:restore-check',
  rollback: 'prod:rollback',
  logs: 'prod:logs',
} as const satisfies Record<ProductionCommandId, string>;

const KILL_ESCALATION_MS = 1_000;
const STDERR_CLASSIFICATION_LIMIT = 16_384;
const PROJECT_ENV_LABEL = {
  check: 'ambiente local de check',
  production: 'ambiente local de produção',
} as const satisfies Record<ProjectLocalEnvironmentKind, string>;
const SUDO_INTERACTIVE_PATTERN =
  /sudo:.*(?:terminal is required|no tty present|password is required|askpass|a terminal is required to read the password)/i;

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

type SpawnProcess = (
  file: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: false;
    stdio: ['ignore', 'pipe', 'pipe'];
  },
) => ChildProcessByStdio<null, Readable, Readable>;

export interface ProductionCommandResult {
  exitCode: number;
  cancelled: boolean;
}

export interface ProductionCommandAdapterOptions {
  spawnProcess?: SpawnProcess;
  maskLog?: (content: string) => MaskedLogContent;
  providerAdapter?: VercelProviderStepAdapter;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function projectEnvironment(
  projectPath: string,
  kind: ProjectLocalEnvironmentKind,
): Promise<NodeJS.ProcessEnv> {
  try {
    return await loadProjectLocalEnvironment(projectPath, kind);
  } catch (error) {
    if (!(error instanceof ProjectLocalEnvironmentError)) throw error;
    const label = PROJECT_ENV_LABEL[kind];
    const message =
      error.code === 'ACCESS_FAILED'
        ? `Não foi possível acessar o ${label} do projeto.`
        : error.code === 'INVALID_FILE'
          ? `O ${label} do projeto é inválido.`
          : `Não foi possível interpretar o ${label} do projeto.`;
    throw new DeploymentError('DEPLOYMENT_PRODUCTION_UNAVAILABLE', message);
  }
}

async function resolvePackageManager(
  projectPath: string,
): Promise<PackageManager> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(projectPath, 'package.json'), 'utf8'),
    ) as { packageManager?: unknown };
    if (typeof parsed.packageManager === 'string') {
      const manager = parsed.packageManager.split('@')[0];
      if (
        manager === 'npm' ||
        manager === 'pnpm' ||
        manager === 'yarn' ||
        manager === 'bun'
      ) {
        return manager;
      }
      throw new DeploymentError(
        'DEPLOYMENT_PACKAGE_MANAGER_UNSUPPORTED',
        'O packageManager declarado pelo projeto não é suportado para produção.',
      );
    }
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
  }

  if (await exists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (
    (await exists(path.join(projectPath, 'bun.lock'))) ||
    (await exists(path.join(projectPath, 'bun.lockb')))
  ) {
    return 'bun';
  }
  return 'npm';
}

export class ProductionCommandAdapter {
  private readonly spawnProcess: SpawnProcess;
  private readonly maskLog: (content: string) => MaskedLogContent;
  private readonly providerAdapter: VercelProviderStepAdapter;

  public constructor(options: ProductionCommandAdapterOptions = {}) {
    this.spawnProcess =
      options.spawnProcess ??
      ((file, args, spawnOptions) => spawn(file, [...args], spawnOptions));
    this.maskLog = options.maskLog ?? maskSensitiveLogContent;
    this.providerAdapter =
      options.providerAdapter ?? new VercelProviderStepAdapter();
  }

  public async run(
    project: Project,
    step: DeploymentPlanStep,
    signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ): Promise<ProductionCommandResult> {
    if (step.id === 'provider-deploy') {
      return this.providerAdapter.run(project, step, signal, onOutput);
    }

    const expectedScript = SCRIPT_BY_COMMAND[step.id];
    if (
      step.script !== expectedScript ||
      project.production?.commands[step.id] !== expectedScript
    ) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        `A etapa ${step.id} não corresponde ao script canônico reconhecido no contrato.`,
      );
    }

    if (step.providerPreflight) {
      try {
        await this.providerAdapter.preflight(
          project,
          step.providerPreflight,
          signal,
        );
      } catch (error) {
        if (signal.aborted) return { exitCode: 1, cancelled: true };
        throw error;
      }
    }

    const packageManager = await resolvePackageManager(project.path);
    const environment = await projectEnvironment(
      project.path,
      step.id === 'check' ? 'check' : 'production',
    );
    const child = this.spawnProcess(packageManager, ['run', expectedScript], {
      cwd: project.path,
      env: { ...process.env, ...environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise<ProductionCommandResult>((resolve, reject) => {
      let settled = false;
      let cancelled = false;
      let escalation: NodeJS.Timeout | undefined;
      let stderrForClassification = '';

      const emit = (chunk: Buffer | string) => {
        onOutput(this.maskLog(chunk.toString()));
      };
      child.stdout.on('data', emit);
      child.stderr.on('data', (chunk: Buffer | string) => {
        const content = chunk.toString();
        if (stderrForClassification.length < STDERR_CLASSIFICATION_LIMIT) {
          stderrForClassification = (stderrForClassification + content).slice(
            -STDERR_CLASSIFICATION_LIMIT,
          );
        }
        emit(content);
      });

      const abort = () => {
        cancelled = true;
        child.kill('SIGTERM');
        escalation = setTimeout(
          () => child.kill('SIGKILL'),
          KILL_ESCALATION_MS,
        );
        escalation.unref();
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();

      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        if (escalation) clearTimeout(escalation);
        reject(error);
      });
      child.once('close', (code) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        if (escalation) clearTimeout(escalation);

        if (
          !cancelled &&
          (code ?? 1) !== 0 &&
          SUDO_INTERACTIVE_PATTERN.test(stderrForClassification)
        ) {
          reject(
            new DeploymentError(
              'DEPLOYMENT_PRIVILEGE_REQUIRED',
              'O comando de produção requer sudo interativo. O dashboard não fornece senha ou TTY; configure uma regra NOPASSWD limitada ao comando necessário ou remova o sudo do script automatizado.',
            ),
          );
          return;
        }

        const finish = async () => {
          if (!cancelled && (code ?? 1) === 0 && step.providerPreflight) {
            try {
              await this.providerAdapter.preflight(
                project,
                step.providerPreflight,
                signal,
              );
            } catch (error) {
              if (signal.aborted) {
                resolve({ exitCode: 1, cancelled: true });
                return;
              }
              reject(error);
              return;
            }
          }
          resolve({ exitCode: code ?? 1, cancelled });
        };
        void finish();
      });
    });
  }
}
