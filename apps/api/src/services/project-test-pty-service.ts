import type { Project } from '@dev-dashboard/contracts';
import type { WebSocket } from 'ws';

import {
  isolateProjectExecutionEnvironment,
} from '../security/project-execution-environment.js';
import {
  loadProjectLocalEnvironment,
  ProjectLocalEnvironmentError,
} from '../security/project-local-environment.js';
import {
  DetachableExecutionError,
  DetachableExecutionService,
  type DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import type { TestDetectionService } from './test-detection-service.js';

export type ProjectTestPtyErrorCode =
  'TEST_COMMAND_NOT_FOUND' | 'ALREADY_RUNNING' | 'START_FAILED';

export class ProjectTestPtyError extends Error {
  public constructor(
    public readonly code: ProjectTestPtyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectTestPtyError';
  }
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
  return `${projectId}:test-pty`;
}

async function testEnvironment(project: Project): Promise<NodeJS.ProcessEnv> {
  try {
    const environment = await loadProjectLocalEnvironment(
      project.path,
      'check',
    );
    const checkDatabaseUrl = environment.CHECK_DATABASE_URL?.trim();

    return isolateProjectExecutionEnvironment(project, {
      ...environment,
      // A aba Testes nunca deve herdar uma DATABASE_URL do processo da API.
      // Projetos que precisam de banco usam explicitamente CHECK_DATABASE_URL;
      // projetos sem banco recebem uma variável vazia em vez de um fallback.
      DATABASE_URL: checkDatabaseUrl ?? '',
      // Credenciais do provider pertencem ao Dev Dashboard e não ao processo
      // de testes do projeto alvo.
      VERCEL_TOKEN: '',
      VERCEL_TEAM_ID: '',
    });
  } catch (error) {
    if (!(error instanceof ProjectLocalEnvironmentError)) throw error;
    throw new ProjectTestPtyError(
      'START_FAILED',
      'O ambiente local de check do projeto é inválido ou não pôde ser lido.',
    );
  }
}

/**
 * PoC da unificação em terminal (task 234, item 1): roda a suíte completa de
 * testes num PTY destacável em vez do modelo antigo (processManager kind
 * `'test'` + SSE). Escopo deliberadamente restrito a "suíte completa" — sem
 * targeting por arquivo/caso/nome nem testes relacionados à branch, que
 * continuam no fluxo antigo por ora.
 */
export class ProjectTestPtyService {
  public constructor(
    private readonly detachable: DetachableExecutionService,
    private readonly testDetectionService: TestDetectionService,
  ) {}

  public snapshot(project: Project): DetachableExecutionSnapshot | undefined {
    return this.detachable.snapshotOf(executionKey(project.id));
  }

  public async start(
    project: Project,
    commandId: string,
  ): Promise<DetachableExecutionSnapshot> {
    let resolved;
    try {
      resolved = await this.testDetectionService.resolveCommand(
        project,
        commandId,
      );
    } catch (error) {
      throw new ProjectTestPtyError(
        'START_FAILED',
        `Não foi possível resolver o comando de teste: ${errorMessage(error)}`,
      );
    }
    if (!resolved) {
      throw new ProjectTestPtyError(
        'TEST_COMMAND_NOT_FOUND',
        'Comando de teste não encontrado para este projeto.',
      );
    }

    const environment = await testEnvironment(project);

    try {
      return this.detachable.start(executionKey(project.id), {
        file: resolved.command,
        args: resolved.args,
        cwd: project.path,
        env: environment,
      });
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'ALREADY_RUNNING'
      ) {
        throw new ProjectTestPtyError('ALREADY_RUNNING', error.message);
      }
      // Falha de spawn (comando não encontrado no PATH do processo da API,
      // permissão negada, etc.) — melhor devolver a causa real do que deixar
      // cair no 500 genérico do handler global.
      throw new ProjectTestPtyError(
        'START_FAILED',
        `Não foi possível iniciar "${resolved.command} ${resolved.args.join(' ')}": ${errorMessage(error)}`,
      );
    }
  }

  /** Reanexa ao WebSocket: sem stdin (execução não-interativa), só envia saída/estado. */
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
          message: 'Nenhuma execução de teste em andamento.',
        });
        socket.close(1000, 'Nenhuma execução em andamento');
        return;
      }
      throw error;
    }

    sendJson(socket, { type: 'ready', snapshot: handle.snapshot });

    // Desconectar não mata a execução — é o ponto da sessão destacável.
    socket.once('close', handle.detach);
    socket.once('error', handle.detach);
  }

  public cancel(project: Project): void {
    this.detachable.cancel(executionKey(project.id));
  }
}
