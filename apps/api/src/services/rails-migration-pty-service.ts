import type {
  Project,
  RailsMigrationMutationOperation,
} from '@dev-dashboard/contracts';
import type { WebSocket } from 'ws';

import {
  DetachableExecutionError,
  DetachableExecutionService,
  type DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import { resolveRailsCommand } from './rails-inspection/command-resolution.js';
import { MUTATION_ARGS } from './rails-inspection/constants.js';
import { RailsMutationError } from './rails-inspection/errors.js';

export interface RailsMigrationPtySnapshot extends DetachableExecutionSnapshot {
  operation: RailsMigrationMutationOperation;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function executionKey(projectId: string): string {
  return `${projectId}:migration-pty`;
}

/**
 * Item 2 da task 234: mesmo padrão de ProjectTestPtyService, aplicado às
 * operações de migration (migrate/rollback/seed/prepare). Substitui por
 * completo o fluxo antigo (RailsInspectionService.runMutation, bloqueante,
 * sem streaming) — não há mais confirmação por token de curta duração no
 * backend porque o catálogo de operações é fechado e a confirmação de fato
 * fica no diálogo do navegador antes de chamar `start`.
 */
export class RailsMigrationPtyService {
  private readonly runningOperation = new Map<
    string,
    RailsMigrationMutationOperation
  >();

  public constructor(private readonly detachable: DetachableExecutionService) {}

  public snapshot(project: Project): RailsMigrationPtySnapshot | undefined {
    const snapshot = this.detachable.snapshotOf(executionKey(project.id));
    if (!snapshot) return undefined;
    const operation = this.runningOperation.get(project.id);
    if (!operation) return undefined;
    return { ...snapshot, operation };
  }

  public async start(
    project: Project,
    operation: RailsMigrationMutationOperation,
  ): Promise<RailsMigrationPtySnapshot> {
    let railsCommand;
    try {
      railsCommand = await resolveRailsCommand(project);
    } catch (error) {
      throw new RailsMutationError(
        'RAILS_MUTATION_FAILED',
        `Não foi possível resolver o comando Rails: ${errorMessage(error)}`,
      );
    }
    if (!railsCommand) {
      throw new RailsMutationError(
        'RAILS_MUTATION_UNSUPPORTED',
        'Não encontramos Rails neste projeto (bin/rails ou Gemfile com Rails).',
      );
    }

    try {
      const snapshot = this.detachable.start(executionKey(project.id), {
        file: railsCommand.command,
        args: [...railsCommand.args, ...MUTATION_ARGS[operation]],
        cwd: project.path,
      });
      this.runningOperation.set(project.id, operation);
      return { ...snapshot, operation };
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'ALREADY_RUNNING'
      ) {
        throw new RailsMutationError(
          'RAILS_MUTATION_ALREADY_RUNNING',
          error.message,
        );
      }
      throw new RailsMutationError(
        'RAILS_MUTATION_FAILED',
        `Não foi possível iniciar "${railsCommand.command} ${[...railsCommand.args, ...MUTATION_ARGS[operation]].join(' ')}": ${errorMessage(error)}`,
      );
    }
  }

  public attach(project: Project, socket: WebSocket): void {
    let handle;
    try {
      handle = this.detachable.attach(
        executionKey(project.id),
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
          message: 'Nenhuma operação de migration em andamento.',
        });
        socket.close(1000, 'Nenhuma execução em andamento');
        return;
      }
      throw error;
    }

    const operation = this.runningOperation.get(project.id);
    sendJson(socket, {
      type: 'ready',
      snapshot: operation ? { ...handle.snapshot, operation } : handle.snapshot,
    });

    // Desconectar não mata a execução — é o ponto da sessão destacável.
    socket.once('close', handle.detach);
    socket.once('error', handle.detach);
  }

  public cancel(project: Project): void {
    this.detachable.cancel(executionKey(project.id));
  }
}
