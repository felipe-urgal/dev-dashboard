import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DeploymentPlanStep,
  ProductionCommandId,
  Project,
} from '@dev-dashboard/contracts';
import {
  maskSensitiveLogContent,
  type MaskedLogContent,
} from '@dev-dashboard/process-manager';

import { DeploymentError } from './errors.js';

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
) => ChildProcessWithoutNullStreams;

export interface ProductionCommandResult {
  exitCode: number;
  cancelled: boolean;
}

export interface ProductionCommandAdapterOptions {
  spawnProcess?: SpawnProcess;
  maskLog?: (content: string) => MaskedLogContent;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePackageManager(projectPath: string): Promise<PackageManager> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(projectPath, 'package.json'), 'utf8'),
    ) as { packageManager?: unknown };
    if (typeof parsed.packageManager === 'string') {
      const manager = parsed.packageManager.split('@')[0];
      if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn' || manager === 'bun') {
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

  public constructor(options: ProductionCommandAdapterOptions = {}) {
    this.spawnProcess =
      options.spawnProcess ??
      ((file, args, spawnOptions) =>
        spawn(file, [...args], spawnOptions) as ChildProcessWithoutNullStreams);
    this.maskLog = options.maskLog ?? maskSensitiveLogContent;
  }

  public async run(
    project: Project,
    step: DeploymentPlanStep,
    signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ): Promise<ProductionCommandResult> {
    const expectedScript = SCRIPT_BY_COMMAND[step.id];
    if (step.script !== expectedScript || project.production?.commands[step.id] !== expectedScript) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        `A etapa ${step.id} não corresponde ao script canônico reconhecido no contrato.`,
      );
    }

    const packageManager = await resolvePackageManager(project.path);
    const child = this.spawnProcess(packageManager, ['run', expectedScript], {
      cwd: project.path,
      env: { ...process.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise<ProductionCommandResult>((resolve, reject) => {
      let settled = false;
      let cancelled = false;
      let escalation: NodeJS.Timeout | undefined;

      const emit = (chunk: Buffer | string) => {
        onOutput(this.maskLog(chunk.toString()));
      };
      child.stdout.on('data', emit);
      child.stderr.on('data', emit);

      const abort = () => {
        cancelled = true;
        child.kill('SIGTERM');
        escalation = setTimeout(() => child.kill('SIGKILL'), KILL_ESCALATION_MS);
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
        resolve({ exitCode: code ?? 1, cancelled });
      });
    });
  }
}
