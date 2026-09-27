import { createHash } from 'node:crypto';

import type {
  ActivityJob,
  ExecutionContext,
  Project,
  ProjectScript,
} from '@dev-dashboard/contracts';
import type { AppendActivityEventInput } from '@dev-dashboard/core';
import type { WebSocket } from 'ws';

import { isolateProjectExecutionEnvironment } from '../security/project-execution-environment.js';
import {
  DetachableExecutionError,
  DetachableExecutionService,
  type DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import {
  buildDevContainerWorkspaceCommand,
  isValidDevContainerRuntimeId,
} from './dev-container-exec-adapter.js';
import type { ScriptDetectionService } from './script-detection-service.js';
import { resolveCommand } from './script-execution/command-resolution.js';

export type ProjectDependenciesPtyErrorCode =
  | 'ACTION_NOT_FOUND'
  | 'ALREADY_RUNNING'
  | 'RUNTIME_UNSUPPORTED'
  | 'START_FAILED';

export class ProjectDependenciesPtyError extends Error {
  public constructor(
    public readonly code: ProjectDependenciesPtyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectDependenciesPtyError';
  }
}

export interface ProjectDependenciesPtySnapshot extends DetachableExecutionSnapshot {
  actionId: string;
  actionName: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function executionKey(
  projectId: string,
  environmentInstanceId: string,
): string {
  return `${projectId}:${environmentInstanceId}:dependencies-pty`;
}

function projectForExecution(
  project: Project,
  executionContext: ExecutionContext,
): Project {
  return { ...project, path: executionContext.cwd };
}

function commandForExecution(
  executionContext: ExecutionContext,
  resolved: { command: string; args: readonly string[] },
): { file: string; args: readonly string[] } {
  if (executionContext.runtime === 'host') {
    return { file: resolved.command, args: resolved.args };
  }
  if (!isValidDevContainerRuntimeId(executionContext.runtimeId)) {
    throw new ProjectDependenciesPtyError(
      'RUNTIME_UNSUPPORTED',
      'O runtime Dev Container selecionado não possui uma identidade executável válida.',
    );
  }

  try {
    return buildDevContainerWorkspaceCommand({
      runtimeId: executionContext.runtimeId,
      workspaceFolder: executionContext.cwd,
      command: resolved.command,
      args: resolved.args,
    });
  } catch {
    throw new ProjectDependenciesPtyError(
      'RUNTIME_UNSUPPORTED',
      'O comando de dependências/build não pode ser executado com segurança neste Dev Container.',
    );
  }
}

/**
 * Mesmo raciocínio de `projectScriptDestination` (apps/web/src/utils/
 * project-script-visibility.ts): instalar/atualizar gems ou pacotes Node, ou
 * rodar o script `build`, são as únicas ações que pertencem à aba
 * Dependências/Build. `ScriptDetectionService.findAction` já restringe ao
 * catálogo fechado do projeto — este filtro é só para manter a mesma
 * fronteira semântica entre painéis, não uma checagem de segurança extra.
 */
function isDependenciesAction(action: ProjectScript): boolean {
  return (
    action.origin === 'bundler' ||
    action.origin === 'package-manager' ||
    action.id === 'package-script:build'
  );
}

/**
 * Item 3 da task 234: mesmo padrão de ProjectTestPtyService/
 * RailsMigrationPtyService, aplicado às ações de dependências/build. O
 * ExecutionContext selecionado define cwd e runtime sem aceitar identidade
 * paralela do cliente. Substitui por completo o fluxo antigo
 * (ScriptExecutionService via SSE, com
 * confirmação por token e histórico persistido) — mesma decisão tomada para
 * Migration: sem preservar o código antigo como referência.
 */
type ActivityEventWriter = {
  append(input: AppendActivityEventInput): Promise<unknown>;
};

interface RunningDependencyAction {
  id: string;
  name: string;
  projectId: string;
  environmentInstanceId: string;
  cancelled: boolean;
}

function dependencyExecutionId(action: RunningDependencyAction): string {
  const digest = createHash('sha256')
    .update(
      `${action.projectId}\u0000${action.environmentInstanceId}\u0000${action.id}`,
    )
    .digest('hex');
  return `dependencies:${digest}`;
}

export class ProjectDependenciesPtyService {
  private readonly runningAction = new Map<string, RunningDependencyAction>();

  public constructor(
    private readonly detachable: DetachableExecutionService,
    private readonly scriptDetectionService: ScriptDetectionService,
    private readonly activityEvents?: ActivityEventWriter,
  ) {}

  public snapshot(
    project: Project,
    executionContext: ExecutionContext,
  ): ProjectDependenciesPtySnapshot | undefined {
    const key = executionKey(
      project.id,
      executionContext.environmentInstanceId,
    );
    const snapshot = this.detachable.snapshotOf(key);
    if (!snapshot) return undefined;
    const action = this.runningAction.get(key);
    if (!action) return undefined;
    return { ...snapshot, actionId: action.id, actionName: action.name };
  }

  public async start(
    project: Project,
    actionId: string,
    executionContext: ExecutionContext,
  ): Promise<ProjectDependenciesPtySnapshot> {
    const scopedProject = projectForExecution(project, executionContext);
    const action = await this.scriptDetectionService.findAction(
      scopedProject,
      actionId,
    );
    if (!action || !isDependenciesAction(action)) {
      throw new ProjectDependenciesPtyError(
        'ACTION_NOT_FOUND',
        'A ação não existe no catálogo de dependências/build deste projeto.',
      );
    }
    if (!action.enabled) {
      throw new ProjectDependenciesPtyError(
        'ACTION_NOT_FOUND',
        'Ações destrutivas permanecem bloqueadas.',
      );
    }

    let resolved;
    try {
      resolved = await resolveCommand(scopedProject, action);
    } catch (error) {
      throw new ProjectDependenciesPtyError(
        'START_FAILED',
        `Não foi possível resolver o comando de "${action.name}": ${errorMessage(error)}`,
      );
    }

    const command = commandForExecution(executionContext, resolved);
    const running: RunningDependencyAction = {
      id: action.id,
      name: action.name,
      projectId: project.id,
      environmentInstanceId: executionContext.environmentInstanceId,
      cancelled: false,
    };
    try {
      const key = executionKey(
        project.id,
        executionContext.environmentInstanceId,
      );
      const snapshot = this.detachable.start(key, {
        file: command.file,
        args: command.args,
        cwd: executionContext.cwd,
        env:
          executionContext.runtime === 'host'
            ? isolateProjectExecutionEnvironment(scopedProject, resolved.env)
            : {},
      });
      this.runningAction.set(key, running);
      await this.recordActivity(running, 'started');
      this.observeCompletion(key, running);
      return { ...snapshot, actionId: action.id, actionName: action.name };
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'ALREADY_RUNNING'
      ) {
        throw new ProjectDependenciesPtyError('ALREADY_RUNNING', error.message);
      }
      await this.recordActivity(running, 'failed');
      throw new ProjectDependenciesPtyError(
        'START_FAILED',
        `Não foi possível iniciar a ação de dependências/build: ${errorMessage(error)}`,
      );
    }
  }

  public attach(
    project: Project,
    socket: WebSocket,
    executionContext: ExecutionContext,
  ): void {
    const key = executionKey(
      project.id,
      executionContext.environmentInstanceId,
    );
    let handle;
    try {
      handle = this.detachable.attach(
        key,
        (chunk) => sendJson(socket, { type: 'output', data: chunk }),
        (snapshot) =>
          sendJson(socket, {
            type: 'exit',
            exitCode: snapshot.exitCode,
            exitSignal: snapshot.exitSignal,
          }),
      );
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'NOT_FOUND'
      ) {
        sendJson(socket, {
          type: 'error',
          message: 'Nenhuma execução de dependências/build em andamento.',
        });
        socket.close(1000, 'Nenhuma execução em andamento');
        return;
      }
      throw error;
    }

    const action = this.runningAction.get(key);
    sendJson(socket, {
      type: 'ready',
      snapshot: action
        ? { ...handle.snapshot, actionId: action.id, actionName: action.name }
        : handle.snapshot,
    });

    // Desconectar não mata a execução — é o ponto da sessão destacável.
    socket.once('close', handle.detach);
    socket.once('error', handle.detach);
  }

  public cancel(project: Project, executionContext: ExecutionContext): void {
    const key = executionKey(
      project.id,
      executionContext.environmentInstanceId,
    );
    const action = this.runningAction.get(key);
    if (action && !action.cancelled) {
      action.cancelled = true;
      void this.recordActivity(action, 'cancelled');
    }
    this.detachable.cancel(key);
  }

  public activityJobs(projectId: string): ActivityJob[] {
    const jobs: ActivityJob[] = [];
    for (const [key, action] of this.runningAction) {
      if (action.projectId !== projectId) continue;
      const snapshot = this.detachable.snapshotOf(key);
      if (!snapshot || snapshot.status !== 'running') continue;
      jobs.push({
        id: dependencyExecutionId(action),
        projectId,
        environmentInstanceId: action.environmentInstanceId,
        domain: 'script',
        action: action.name,
        status: 'running',
        startedAt: snapshot.startedAt,
        resourceRef: {
          kind: 'dependencies-execution',
          id: dependencyExecutionId(action),
        },
        cancelSupported: true,
      });
    }
    return jobs;
  }

  private observeCompletion(
    key: string,
    action: RunningDependencyAction,
  ): void {
    this.detachable.attach(
      key,
      () => undefined,
      (snapshot) => {
        if (!action.cancelled) {
          void this.recordActivity(
            action,
            snapshot.exitCode === 0 ? 'succeeded' : 'failed',
          );
        }
      },
    );
  }

  private async recordActivity(
    action: RunningDependencyAction,
    status: 'started' | 'succeeded' | 'failed' | 'cancelled',
  ): Promise<void> {
    if (!this.activityEvents) return;
    try {
      await this.activityEvents.append({
        projectId: action.projectId,
        environmentInstanceId: action.environmentInstanceId,
        domain: 'script',
        type: 'dependencies.execute',
        status,
        summary: `Dependências/Build: ${action.name}`,
        resourceRef: {
          kind: 'dependencies-execution',
          id: dependencyExecutionId(action),
        },
        jobId: dependencyExecutionId(action),
      });
    } catch {
      // Observabilidade nunca deve alterar o resultado da operação principal.
    }
  }
}
