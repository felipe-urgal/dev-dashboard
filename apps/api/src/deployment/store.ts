import { homedir } from 'node:os';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  Deployment,
  DeploymentHistory,
  DeploymentLog,
} from '@dev-dashboard/contracts';
import type { MaskedLogContent } from '@dev-dashboard/process-manager';

import {
  isPersistedDeployment,
  isPersistedDeploymentLog,
} from './persistence-validation.js';

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_LOG_LIMIT_BYTES = 512 * 1024;
const ACTIVE_STATUSES = new Set<Deployment['status']>([
  'preparing',
  'backing_up',
  'migrating',
  'deploying',
  'verifying',
]);

function utf8TailWithinByteLimit(value: string, limit: number): string {
  if (Buffer.byteLength(value, 'utf8') <= limit) return value;
  const codePoints = Array.from(value);
  let bytes = 0;
  let start = codePoints.length;
  for (let index = codePoints.length - 1; index >= 0; index -= 1) {
    const character = codePoints[index]!;
    const next = Buffer.byteLength(character, 'utf8');
    if (bytes + next > limit) break;
    bytes += next;
    start = index;
  }
  return codePoints.slice(start).join('');
}

async function atomicJsonWrite(
  filePath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

function invalidDeploymentStateError(fileName: string): Error {
  return new Error(
    `Estado persistido de deployment inválido em ${fileName}; corrija ou remova o arquivo antes de iniciar novos deployments.`,
  );
}

export interface DeploymentStoreOptions {
  historyLimit?: number;
  logLimitBytes?: number;
}

export class DeploymentStore {
  private readonly deployments = new Map<string, Deployment>();
  private readonly logs = new Map<string, DeploymentLog>();
  private readonly pendingLogWrites = new Map<string, Promise<void>>();
  private readonly readyPromise: Promise<void>;
  private readonly historyLimit: number;
  private readonly logLimitBytes: number;

  public constructor(
    private readonly stateDirectory = path.join(
      process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
        path.join(homedir(), '.local', 'state', 'dev-dashboard'),
      'deployments',
    ),
    options: DeploymentStoreOptions = {},
  ) {
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.logLimitBytes = options.logLimitBytes ?? DEFAULT_LOG_LIMIT_BYTES;
    this.readyPromise = this.restore();
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  public async save(deployment: Deployment): Promise<void> {
    await this.readyPromise;
    this.deployments.set(deployment.id, structuredClone(deployment));
    await atomicJsonWrite(this.recordPath(deployment.id), deployment);
    await this.pruneProject(deployment.projectId);
  }

  public async get(deploymentId: string): Promise<Deployment | null> {
    await this.readyPromise;
    const deployment = this.deployments.get(deploymentId);
    return deployment ? structuredClone(deployment) : null;
  }

  public async history(
    projectId: string,
    page = 1,
    pageSize = 20,
  ): Promise<DeploymentHistory> {
    await this.readyPromise;
    const matching = [...this.deployments.values()]
      .filter((deployment) => deployment.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const start = (page - 1) * pageSize;
    return {
      items: matching
        .slice(start, start + pageSize)
        .map((item) => structuredClone(item)),
      page,
      pageSize,
      total: matching.length,
    };
  }

  public async appendLog(
    deploymentId: string,
    output: MaskedLogContent,
  ): Promise<void> {
    await this.readyPromise;
    const current = this.logs.get(deploymentId) ?? {
      deploymentId,
      content: '',
      truncated: false,
      masked: false,
      redactionCount: 0,
    };
    const combined = `${current.content}${output.content}`;
    const trimmed = utf8TailWithinByteLimit(combined, this.logLimitBytes);
    const next: DeploymentLog = {
      deploymentId,
      content: trimmed,
      truncated: current.truncated || trimmed !== combined,
      masked: current.masked || output.masked,
      redactionCount: current.redactionCount + output.redactionCount,
    };
    this.logs.set(deploymentId, next);

    const previous =
      this.pendingLogWrites.get(deploymentId) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(() => atomicJsonWrite(this.logPath(deploymentId), next));
    this.pendingLogWrites.set(deploymentId, queued);
    await queued;
  }

  public async log(deploymentId: string): Promise<DeploymentLog> {
    await this.readyPromise;
    await this.pendingLogWrites.get(deploymentId)?.catch(() => undefined);
    const log = this.logs.get(deploymentId);
    return log
      ? structuredClone(log)
      : {
          deploymentId,
          content: '',
          truncated: false,
          masked: false,
          redactionCount: 0,
        };
  }

  public async recoverInterrupted(now = Date.now()): Promise<void> {
    await this.readyPromise;
    const finishedAt = new Date(now).toISOString();
    for (const deployment of this.deployments.values()) {
      if (!ACTIVE_STATUSES.has(deployment.status)) continue;
      const irreversibleStarted = deployment.timeline.some(
        (step) =>
          step.irreversible &&
          (step.status === 'running' || step.status === 'succeeded'),
      );
      const timeline = deployment.timeline.map((step) =>
        step.status === 'running'
          ? { ...step, status: 'failed' as const, finishedAt }
          : step,
      );
      const recovered: Deployment = {
        ...deployment,
        status: irreversibleStarted ? 'recovery_required' : 'failed',
        finishedAt,
        failurePoint: irreversibleStarted
          ? 'after-irreversible'
          : 'before-irreversible',
        errorCode: 'DEPLOYMENT_INTERRUPTED',
        errorMessage:
          'A execução foi interrompida pelo encerramento do Dev Dashboard.',
        timeline,
      };
      this.deployments.set(deployment.id, recovered);
      await atomicJsonWrite(this.recordPath(deployment.id), recovered);
    }
  }

  private async restore(): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.stateDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(this.stateDirectory, entry.name);
      if (entry.name.endsWith('.log.json')) {
        try {
          const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
          if (isPersistedDeploymentLog(parsed)) {
            this.logs.set(parsed.deploymentId, parsed);
          }
        } catch {
          // Log local inválido não altera o estado operacional do deployment.
        }
        continue;
      }
      if (!entry.name.endsWith('.json')) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(filePath, 'utf8'));
      } catch {
        throw invalidDeploymentStateError(entry.name);
      }
      if (!isPersistedDeployment(parsed)) {
        throw invalidDeploymentStateError(entry.name);
      }
      this.deployments.set(parsed.id, parsed);
    }
  }

  private async pruneProject(projectId: string): Promise<void> {
    const items = [...this.deployments.values()]
      .filter((deployment) => deployment.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const old of items.slice(this.historyLimit)) {
      this.deployments.delete(old.id);
      this.logs.delete(old.id);
      await Promise.all([
        rm(this.recordPath(old.id), { force: true }),
        rm(this.logPath(old.id), { force: true }),
      ]);
    }
  }

  private recordPath(deploymentId: string): string {
    return path.join(this.stateDirectory, `${deploymentId}.json`);
  }

  private logPath(deploymentId: string): string {
    return path.join(this.stateDirectory, `${deploymentId}.log.json`);
  }
}
