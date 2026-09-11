import type {
  ExecutionContext,
  Project,
  ProjectScript,
} from '@dev-dashboard/contracts';
import type { WebSocket } from 'ws';

import { isolateProjectExecutionEnvironment } from '../security/project-execution-environment.js';
import {
  DetachableExecutionError,
  DetachableExecutionService,
  type DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import type { ScriptDetectionService } from './script-detection-service.js';
import { resolveCommand } from './script-execution/command-resolution.js';

export type ProjectDependenciesPtyErrorCode =
  'ACTION_NOT_FOUND' | 'ALREADY_RUNNING' | 'START_FAILED';

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
 * RailsMigrationPtyService, aplicado às ações de dependências/build. Substitui
 * por completo o fluxo antigo (ScriptExecutionService via SSE, com
 * confirmação por token e histórico persistido) — mesma decisão tomada para
 * Migration: sem preservar o código antigo como referência.
 */
export class ProjectDependenciesPtyService {
  private readonly runningAction = new Map<
    string,
    { id: string; name: string }
  >();

  public constructor(
    private readonly detachable: DetachableExecutionService,
    private readonly scriptDetectionService: ScriptDetectionService,
  ) {}

  public snapshot(
    project: Project,
    executionContext: ExecutionContext,
  ): ProjectDependenciesPtySnapshot | undefined {
    const key = executionKey(project.id, executionContext.environmentInstanceId);
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

    try {
      const key = executionKey(
        project.id,
        executionContext.environmentInstanceId,
      );
      const snapshot = this.detachable.start(key, {
        file: resolved.command,
        args: resolved.args,
        cwd: executionContext.cwd,
        env: isolateProjectExecutionEnvironment(scopedProject, resolved.env),
      });
      this.runningAction.set(key, {
        id: action.id,
        name: action.name,
      });
      return { ...snapshot, actionId: action.id, actionName: action.name };
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'ALREADY_RUNNING'
      ) {
        throw new ProjectDependenciesPtyError('ALREADY_RUNNING', error.message);
      }
      throw new ProjectDependenciesPtyError(
        'START_FAILED',
        `Não foi possível iniciar "${resolved.command} ${resolved.args.join(' ')}": ${errorMessage(error)}`,
      );
    }
  }

  public attach(
    project: Project,
    socket: WebSocket,
    executionContext: ExecutionContext,
  ): void {
    const key = executionKey(project.id, executionContext.environmentInstanceId);
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
    this.detachable.cancel(
      executionKey(project.id, executionContext.environmentInstanceId),
    );
  }
}
