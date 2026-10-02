import type { ExecutionContext, Project } from '@dev-dashboard/contracts';
import type { WebSocket } from 'ws';

import {
  loadProjectLocalEnvironment,
  ProjectLocalEnvironmentError,
} from '../security/project-local-environment.js';
import { buildProjectTestEnvironment } from '../security/project-test-environment.js';
import {
  DetachableExecutionError,
  DetachableExecutionService,
  type DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import {
  buildDevContainerTestCommand,
  isValidDevContainerRuntimeId,
} from './dev-container-exec-adapter.js';
import {
  TestFileError,
  type TestDetectionService,
} from './test-detection-service.js';
import type { TestExecutionHistoryService } from './test-execution-history-service.js';
import {
  RelatedTestError,
  RelatedTestService,
} from './related-test-service.js';

export type ProjectTestPtyErrorCode =
  | 'TEST_COMMAND_NOT_FOUND'
  | 'ALREADY_RUNNING'
  | 'RUNTIME_UNSUPPORTED'
  | 'TARGET_INVALID'
  | 'NO_RELATED_TESTS'
  | 'START_FAILED';

export class ProjectTestPtyError extends Error {
  public constructor(
    public readonly code: ProjectTestPtyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectTestPtyError';
  }
}

export type ProjectTestPtyMode = 'full-suite' | 'file' | 'related';

export interface ProjectTestPtyStartRequest {
  commandId: string;
  mode?: ProjectTestPtyMode;
  path?: string;
  line?: number;
  namePattern?: string;
}

export interface ProjectTestPtySnapshot extends DetachableExecutionSnapshot {
  commandId: string;
  environmentInstanceId: string;
  scope: 'full-suite' | 'targeted';
  targetFiles: string[];
  cancelled: boolean;
}

interface ExecutionMetadata {
  commandId: string;
  environmentInstanceId: string;
  scope: 'full-suite' | 'targeted';
  targetFiles: string[];
  cancelled: boolean;
  historyId: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function primaryExecutionContext(project: Project): ExecutionContext {
  return {
    projectId: project.id,
    environmentInstanceId: `environment:primary:${project.id}`,
    cwd: project.path,
    runtime: 'host',
  };
}

function executionKey(
  projectId: string,
  environmentInstanceId: string,
): string {
  return `${projectId}:${environmentInstanceId}:test-pty`;
}

function projectForExecution(
  project: Project,
  executionContext: ExecutionContext,
): Project {
  return { ...project, path: executionContext.cwd };
}

async function testEnvironment(
  project: Project,
  executionContext: ExecutionContext,
): Promise<NodeJS.ProcessEnv> {
  try {
    const environment = await loadProjectLocalEnvironment(
      project.path,
      'check',
    );

    if (
      executionContext.runtime === 'devcontainer' &&
      Object.keys(environment).length > 0
    ) {
      throw new ProjectTestPtyError(
        'RUNTIME_UNSUPPORTED',
        'Testes em Dev Container ainda não injetam valores de .env.check.local. Remova esse override ou execute a suíte no host.',
      );
    }

    return buildProjectTestEnvironment(
      project,
      executionContext.runtime === 'host' ? environment : {},
    );
  } catch (error) {
    if (error instanceof ProjectTestPtyError) throw error;
    if (!(error instanceof ProjectLocalEnvironmentError)) throw error;
    throw new ProjectTestPtyError(
      'START_FAILED',
      'O ambiente local de check do projeto é inválido ou não pôde ser lido.',
    );
  }
}

function devContainerRemoteEnvironment(
  project: Project,
): Readonly<Record<string, string>> {
  return project.type === 'rails'
    ? { RAILS_ENV: 'test', RACK_ENV: 'test' }
    : {};
}

function devContainerTestCommand(
  project: Project,
  executionContext: ExecutionContext,
  resolved: { command: string; args: readonly string[] },
) {
  if (!isValidDevContainerRuntimeId(executionContext.runtimeId)) {
    throw new ProjectTestPtyError(
      'RUNTIME_UNSUPPORTED',
      'O runtime Dev Container selecionado não possui uma identidade executável válida.',
    );
  }

  try {
    return buildDevContainerTestCommand({
      runtimeId: executionContext.runtimeId,
      workspaceFolder: executionContext.cwd,
      command: resolved.command,
      args: resolved.args,
      remoteEnvironment: devContainerRemoteEnvironment(project),
    });
  } catch {
    throw new ProjectTestPtyError(
      'RUNTIME_UNSUPPORTED',
      'O comando de teste detectado não pode ser executado com segurança neste Dev Container.',
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
  private readonly metadata = new Map<string, ExecutionMetadata>();
  private readonly relatedTestService: RelatedTestService;

  public constructor(
    private readonly detachable: DetachableExecutionService,
    private readonly testDetectionService: TestDetectionService,
    private readonly historyService: TestExecutionHistoryService,
  ) {
    this.relatedTestService = new RelatedTestService(testDetectionService);
  }

  public snapshot(
    project: Project,
    executionContext: ExecutionContext = primaryExecutionContext(project),
  ): ProjectTestPtySnapshot | undefined {
    const key = executionKey(project.id, executionContext.environmentInstanceId);
    const snapshot = this.detachable.snapshotOf(key);
    if (!snapshot) {
      this.metadata.delete(key);
      return undefined;
    }
    return this.withMetadata(key, snapshot);
  }

  public async start(
    project: Project,
    request: string | ProjectTestPtyStartRequest,
    executionContext: ExecutionContext = primaryExecutionContext(project),
  ): Promise<ProjectTestPtySnapshot> {
    const input: ProjectTestPtyStartRequest =
      typeof request === 'string' ? { commandId: request } : request;
    const scopedProject = projectForExecution(project, executionContext);
    const key = executionKey(project.id, executionContext.environmentInstanceId);
    if (this.detachable.isRunning(key)) {
      throw new ProjectTestPtyError(
        'ALREADY_RUNNING',
        'Já existe uma execução de testes em andamento neste ambiente.',
      );
    }

    let resolved: { command: string; args: string[] } | null = null;
    let scope: 'full-suite' | 'targeted' = 'full-suite';
    let targetFiles: string[] = [];
    try {
      if (input.mode === 'file') {
        if (!input.path) {
          throw new ProjectTestPtyError(
            'TARGET_INVALID',
            'Informe o arquivo de teste que deve ser executado.',
          );
        }
        resolved = await this.testDetectionService.resolveFileCommand(
          scopedProject,
          input.commandId,
          input.path,
          input.line,
          input.namePattern,
        );
        scope = 'targeted';
        targetFiles = [input.path];
      } else if (input.mode === 'related') {
        const related = await this.relatedTestService.resolve(
          scopedProject,
          input.commandId,
        );
        if (related.testFiles.length === 0) {
          throw new ProjectTestPtyError(
            'NO_RELATED_TESTS',
            'Nenhum teste relacionado às alterações da branch foi encontrado.',
          );
        }
        resolved = related.resolved;
        scope = 'targeted';
        targetFiles = related.testFiles;
      } else {
        resolved = await this.testDetectionService.resolveCommand(
          scopedProject,
          input.commandId,
        );
      }
    } catch (error) {
      if (error instanceof ProjectTestPtyError) throw error;
      if (error instanceof TestFileError || error instanceof RelatedTestError) {
        throw new ProjectTestPtyError('TARGET_INVALID', error.message);
      }
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

    const environment = await testEnvironment(scopedProject, executionContext);
    const command =
      executionContext.runtime === 'devcontainer'
        ? devContainerTestCommand(scopedProject, executionContext, resolved)
        : { file: resolved.command, args: resolved.args };

    let snapshot: DetachableExecutionSnapshot;
    try {
      snapshot = this.detachable.start(key, {
        file: command.file,
        args: command.args,
        cwd: executionContext.cwd,
        env: environment,
      });
    } catch (error) {
      if (
        error instanceof DetachableExecutionError &&
        error.code === 'ALREADY_RUNNING'
      ) {
        throw new ProjectTestPtyError('ALREADY_RUNNING', error.message);
      }
      throw new ProjectTestPtyError(
        'START_FAILED',
        `Não foi possível iniciar "${resolved.command} ${resolved.args.join(' ')}": ${errorMessage(error)}`,
      );
    }

    let historyId: string;
    try {
      historyId = await this.historyService.recordPtyStart(project.id, {
        commandId: input.commandId,
        environmentInstanceId: executionContext.environmentInstanceId,
        cwd: executionContext.cwd,
        startedAt: snapshot.startedAt,
        scope,
        ...(targetFiles.length > 0 ? { targetFiles } : {}),
      });
    } catch (error) {
      this.detachable.cancel(key);
      throw new ProjectTestPtyError(
        'START_FAILED',
        `A execução foi interrompida porque o histórico não pôde ser registrado: ${errorMessage(error)}`,
      );
    }

    this.metadata.set(key, {
      commandId: input.commandId,
      environmentInstanceId: executionContext.environmentInstanceId,
      scope,
      targetFiles,
      cancelled: false,
      historyId,
    });

    const handle = this.detachable.attach(
      key,
      () => undefined,
      (ended) => {
        void this.finishHistory(project.id, key, ended);
      },
    );
    if (handle.snapshot.status === 'exited') {
      await this.finishHistory(project.id, key, handle.snapshot);
    }

    return this.withMetadata(key, snapshot);
  }

  /** Reanexa ao WebSocket: sem stdin (execução não-interativa), só envia saída/estado. */
  public attach(
    project: Project,
    socket: WebSocket,
    executionContext: ExecutionContext = primaryExecutionContext(project),
  ): void {
    let handle;
    try {
      handle = this.detachable.attach(
        executionKey(project.id, executionContext.environmentInstanceId),
        (chunk) => sendJson(socket, { type: 'output', data: chunk }),
        (snapshot) =>
          sendJson(socket, {
            type: 'exit',
            exitCode: snapshot.exitCode,
            exitSignal: snapshot.exitSignal,
            snapshot: this.withMetadata(
              executionKey(project.id, executionContext.environmentInstanceId),
              snapshot,
            ),
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

    sendJson(socket, {
      type: 'ready',
      snapshot: this.withMetadata(
        executionKey(project.id, executionContext.environmentInstanceId),
        handle.snapshot,
      ),
    });

    // Desconectar não mata a execução — é o ponto da sessão destacável.
    socket.once('close', handle.detach);
    socket.once('error', handle.detach);
  }

  public cancel(
    project: Project,
    executionContext: ExecutionContext = primaryExecutionContext(project),
  ): void {
    const key = executionKey(project.id, executionContext.environmentInstanceId);
    const metadata = this.metadata.get(key);
    if (metadata) metadata.cancelled = true;
    this.detachable.cancel(key);
  }

  private withMetadata(
    key: string,
    snapshot: DetachableExecutionSnapshot,
  ): ProjectTestPtySnapshot {
    const metadata = this.metadata.get(key);
    if (!metadata) {
      throw new ProjectTestPtyError(
        'START_FAILED',
        'A identidade da execução de testes não está mais disponível.',
      );
    }
    return {
      ...snapshot,
      commandId: metadata.commandId,
      environmentInstanceId: metadata.environmentInstanceId,
      scope: metadata.scope,
      targetFiles: [...metadata.targetFiles],
      cancelled: metadata.cancelled,
    };
  }

  private async finishHistory(
    projectId: string,
    key: string,
    snapshot: DetachableExecutionSnapshot,
  ): Promise<void> {
    const metadata = this.metadata.get(key);
    if (!metadata) return;
    await this.historyService.recordPtyFinish(projectId, metadata.historyId, {
      exitCode: snapshot.exitCode,
      finishedAt: snapshot.endedAt ?? new Date().toISOString(),
      ...(metadata.cancelled ? { cancelled: true } : {}),
    });
  }
}
