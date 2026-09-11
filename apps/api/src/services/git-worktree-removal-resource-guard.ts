import type { ManagedProcess } from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type {
  GitWorktreeRemovalResourceGuard,
  GitWorktreeRemovalResourceGuardResult,
} from './git-worktree-lifecycle-service.js';
import type { ProjectTerminalService } from './project-terminal-service.js';

const ACTIVE_PROCESS_STATUSES = new Set<ManagedProcess['status']>([
  'starting',
  'running',
  'stopping',
]);

export interface GitWorktreeRemovalResourceGuardDependencies {
  processManager: Pick<ProcessManager, 'listProcesses'>;
  projectStore: Pick<ProjectStore, 'findProject'>;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'findById' | 'removeWorktreeInstance'
  >;
  projectTerminalService: Pick<ProjectTerminalService, 'status'>;
}

/**
 * Prova ownership somente a partir dos identificadores persistidos pelos
 * domínios atuais. Não usa path, porta ou PID como heurística para decidir se
 * um recurso pertence ao worktree.
 */
export class GitWorktreeRemovalResourceGuardService
  implements GitWorktreeRemovalResourceGuard
{
  public constructor(
    private readonly dependencies: GitWorktreeRemovalResourceGuardDependencies,
  ) {}

  public async inspect(
    environmentInstanceId: string,
  ): Promise<GitWorktreeRemovalResourceGuardResult> {
    const instance =
      this.dependencies.developmentEnvironmentInstanceStore.findById(
        environmentInstanceId,
      );
    if (!instance || instance.source.kind !== 'worktree') {
      return {
        safe: false,
        diagnostic:
          'A Environment Instance do worktree não pôde ser confirmada para remoção.',
      };
    }

    if (instance.runtime.kind !== 'host') {
      return {
        safe: false,
        diagnostic:
          'O runtime associado ao worktree ainda não possui cleanup seguro suportado por este lifecycle.',
      };
    }

    if (instance.lifecycle === 'starting' || instance.lifecycle === 'stopping') {
      return {
        safe: false,
        diagnostic:
          'O ambiente ainda está em transição. Aguarde o lifecycle terminar antes de remover o worktree.',
      };
    }

    const project = this.dependencies.projectStore.findProject(
      instance.projectId,
    );
    if (!project) {
      return {
        safe: false,
        diagnostic:
          'O projeto dono da Environment Instance não pôde ser confirmado.',
      };
    }

    let processes: ManagedProcess[];
    try {
      processes = await this.dependencies.processManager.listProcesses();
    } catch {
      return {
        safe: false,
        diagnostic:
          'Os processos gerenciados não puderam ser inspecionados para confirmar ownership.',
      };
    }

    const activeProcesses = processes.filter((process) =>
      ACTIVE_PROCESS_STATUSES.has(process.status),
    );
    if (
      activeProcesses.some(
        (process) => process.environmentInstanceId === environmentInstanceId,
      )
    ) {
      return {
        safe: false,
        diagnostic:
          'O worktree ainda possui processo gerenciado ativo. Encerre o processo antes de remover o ambiente.',
      };
    }

    if (
      activeProcesses.some(
        (process) =>
          process.projectId === instance.projectId &&
          process.environmentInstanceId === undefined,
      )
    ) {
      return {
        safe: false,
        diagnostic:
          'Existe processo ativo do projeto sem Environment Instance verificável. A remoção permanece bloqueada por segurança.',
      };
    }

    const executionContext = {
      projectId: instance.projectId,
      environmentInstanceId: instance.id,
      cwd: instance.source.path,
      runtime: instance.runtime.kind,
    } as const;
    const terminalSessions =
      this.dependencies.projectTerminalService.status(
        project,
        'shell',
        executionContext,
      ).activeSessions +
      this.dependencies.projectTerminalService.status(
        project,
        'rails-console',
        executionContext,
      ).activeSessions;

    if (terminalSessions > 0) {
      return {
        safe: false,
        diagnostic:
          'O worktree ainda possui sessão de terminal ativa. Feche a sessão antes de remover o ambiente.',
      };
    }

    return { safe: true };
  }

  public async cleanupRemoved(environmentInstanceId: string): Promise<void> {
    const ownership = await this.inspect(environmentInstanceId);
    if (!ownership.safe) {
      throw new Error(
        ownership.diagnostic ??
          'A ownership dos recursos do ambiente não pôde ser confirmada.',
      );
    }

    const removed =
      this.dependencies.developmentEnvironmentInstanceStore.removeWorktreeInstance(
        environmentInstanceId,
      );
    if (!removed) {
      throw new Error(
        'A Environment Instance não pôde ser removida sem ampliar a ownership do cleanup.',
      );
    }
  }
}
