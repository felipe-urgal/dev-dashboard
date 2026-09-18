import type {
  DevelopmentEnvironmentInstance,
  ManagedProcess,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DetachableExecutionService } from './detachable-execution-service.js';
import type { ProjectTerminalService } from './project-terminal-service.js';

const ACTIVE_PROCESS_STATUSES = new Set<ManagedProcess['status']>([
  'starting',
  'running',
  'stopping',
]);

export interface EnvironmentInstanceCleanupDependencies {
  processManager: Pick<
    ProcessManager,
    'listProcesses' | 'stopServer' | 'stopTest' | 'stopWorker'
  >;
  projectTerminalService: Pick<ProjectTerminalService, 'closeEnvironment'>;
  detachableExecutionService?: Pick<
    DetachableExecutionService,
    'cleanupEnvironment'
  >;
}

export interface EnvironmentInstanceCleanupResult {
  state: 'cleaned' | 'cleanup-required' | 'skipped';
  diagnostic?: string;
}

export class EnvironmentInstanceCleanupService {
  public constructor(
    private readonly dependencies: EnvironmentInstanceCleanupDependencies,
  ) {}

  public async cleanupMissingWorktree(
    instance: DevelopmentEnvironmentInstance,
  ): Promise<EnvironmentInstanceCleanupResult> {
    if (
      instance.source.kind !== 'worktree' ||
      instance.lifecycle !== 'degraded'
    ) {
      return { state: 'skipped' };
    }

    if (instance.runtime.kind !== 'host') {
      return {
        state: 'cleanup-required',
        diagnostic:
          'O runtime do ambiente removido ainda não possui cleanup automático suportado.',
      };
    }

    let cleanupFailed = false;
    let processes: ManagedProcess[] = [];

    try {
      processes = await this.dependencies.processManager.listProcesses();
    } catch {
      cleanupFailed = true;
    }

    const ownedProcesses = processes.filter(
      (process) =>
        process.environmentInstanceId === instance.id &&
        ACTIVE_PROCESS_STATUSES.has(process.status),
    );
    const processResults = await Promise.allSettled(
      ownedProcesses.map((process) =>
        this.stopOwnedProcess(instance.id, process),
      ),
    );
    if (processResults.some((result) => result.status === 'rejected')) {
      cleanupFailed = true;
    }

    try {
      this.dependencies.projectTerminalService.closeEnvironment(instance.id);
    } catch {
      cleanupFailed = true;
    }

    try {
      this.dependencies.detachableExecutionService?.cleanupEnvironment(
        instance.projectId,
        instance.id,
      );
    } catch {
      cleanupFailed = true;
    }

    if (cleanupFailed) {
      return {
        state: 'cleanup-required',
        diagnostic:
          'O worktree desapareceu, mas nem todos os recursos pertencentes ao ambiente puderam ser encerrados.',
      };
    }

    return { state: 'cleaned' };
  }

  private stopOwnedProcess(
    environmentInstanceId: string,
    process: ManagedProcess,
  ): Promise<ManagedProcess> {
    switch (process.kind) {
      case 'server':
        return this.dependencies.processManager.stopServer(
          process.projectId,
          environmentInstanceId,
        );
      case 'test':
        return this.dependencies.processManager.stopTest(
          process.projectId,
          environmentInstanceId,
        );
      case 'worker':
      case 'webpack':
        return this.dependencies.processManager.stopWorker(
          process.projectId,
          process.kind,
          environmentInstanceId,
        );
      case 'script':
        return Promise.reject(
          new Error('Processo de script não pertence ao Process Manager.'),
        );
    }
  }
}
