import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import { resolveServerCommand } from './command-resolution.js';
import { isErrnoException, ProcessManagerError } from './errors.js';
import {
  prepareManagedProcessStart,
  startManagedProcess,
  type ManagedProcessStartDependencies,
} from './managed-process-start.js';
import {
  canListen,
  findAvailablePort,
  listServerUrls,
  SERVER_BIND_HOST,
  validatePort,
} from './port-utils.js';
import type { ExitTracker } from './process-exit-tracking.js';
import {
  isManagedProcessAlive,
  verifyProcessDirectory,
} from './process-state.js';
import type { ProcessStatusReader } from './process-status.js';
import {
  readStoredProcess,
  terminalProcess,
  writeStoredProcess,
  type ManagedKind,
  type ProcessStoreContext,
} from './process-store.js';
import type { StoredProcess } from './process-state.js';

export interface StartServerOptions {
  port?: number;
  environment?: NodeJS.ProcessEnv;
}

export interface StartWorkerCommand {
  id: string;
  command: string;
  args: string[];
}

export interface ProcessLifecycle {
  startManagedServer(
    project: Project,
    options: StartServerOptions,
    stateDirectory: string,
  ): Promise<ManagedProcess>;
  startManagedTest(
    project: Project,
    command: { id: string; command: string; args: string[] },
    stateDirectory: string,
  ): Promise<ManagedProcess>;
  startManagedWorker(
    project: Project,
    kind: Extract<ManagedKind, 'worker' | 'webpack'>,
    command: StartWorkerCommand,
    stateDirectory: string,
  ): Promise<ManagedProcess>;
  stopManagedProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ManagedProcess>;
  sendSignal(pid: number, signal: NodeJS.Signals): void;
}

export function createProcessLifecycle(
  context: ProcessStoreContext,
  exitTracker: ExitTracker,
  statusReader: ProcessStatusReader,
): ProcessLifecycle {
  function sendSignal(pid: number, signal: NodeJS.Signals): void {
    try {
      if (process.platform === 'win32') {
        process.kill(pid, signal);
        return;
      }

      process.kill(-pid, signal);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ESRCH') {
        return;
      }

      throw error;
    }
  }

  function startDependencies(
    stateDirectory: string,
  ): ManagedProcessStartDependencies {
    return {
      context,
      exitTracker,
      statusReader,
      stateDirectory,
      sendSignal,
    };
  }

  async function startManagedServer(
    project: Project,
    options: StartServerOptions,
    stateDirectory: string,
  ): Promise<ManagedProcess> {
    const dependencies = startDependencies(stateDirectory);

    await prepareManagedProcessStart(
      dependencies,
      project,
      'server',
      `O servidor de ${project.name} já está em execução.`,
    );

    const requestedPort = options.port ?? project.port;

    if (requestedPort !== undefined) {
      validatePort(requestedPort);

      if (!(await canListen(SERVER_BIND_HOST, requestedPort))) {
        throw new ProcessManagerError(
          'PORT_NOT_AVAILABLE',
          `A porta ${requestedPort} não está disponível.`,
        );
      }
    }

    const port = requestedPort ?? (await findAvailablePort(SERVER_BIND_HOST));
    const resolvedCommand = await resolveServerCommand(
      project,
      SERVER_BIND_HOST,
      port,
    );
    const primaryUrl = `http://localhost:${port}`;

    return startManagedProcess(dependencies, {
      project,
      kind: 'server',
      id: `${project.id}:server`,
      status: 'starting',
      command: resolvedCommand.command,
      args: resolvedCommand.args,
      env: {
        ...process.env,
        ...options.environment,
        ...resolvedCommand.env,
      },
      missingPidMessage: `Não foi possível obter o PID do servidor de ${project.name}.`,
      metadata: {
        port,
        url: primaryUrl,
        urls: listServerUrls(port),
      },
    });
  }

  async function startManagedTest(
    project: Project,
    command: { id: string; command: string; args: string[] },
    stateDirectory: string,
  ): Promise<ManagedProcess> {
    const dependencies = startDependencies(stateDirectory);

    await prepareManagedProcessStart(
      dependencies,
      project,
      'test',
      `Já existe uma execução de testes em andamento para ${project.name}.`,
    );

    return startManagedProcess(dependencies, {
      project,
      kind: 'test',
      id: `${project.id}:test:${command.id}`,
      status: 'running',
      command: command.command,
      args: command.args,
      env: {
        ...process.env,
        CI: 'true',
      },
      missingPidMessage: `Não foi possível obter o PID da execução de testes de ${project.name}.`,
    });
  }

  async function startManagedWorker(
    project: Project,
    kind: Extract<ManagedKind, 'worker' | 'webpack'>,
    command: StartWorkerCommand,
    stateDirectory: string,
  ): Promise<ManagedProcess> {
    const dependencies = startDependencies(stateDirectory);

    await prepareManagedProcessStart(
      dependencies,
      project,
      kind,
      `O worker de ${project.name} já está em execução.`,
    );

    return startManagedProcess(dependencies, {
      project,
      kind,
      id: `${project.id}:${kind}:${command.id}`,
      status: 'running',
      command: command.command,
      args: command.args,
      env: { ...process.env },
      missingPidMessage: `Não foi possível obter o PID do worker de ${project.name}.`,
    });
  }

  async function stopManagedProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ManagedProcess> {
    const storedProcess = await readStoredProcess(context, projectId, kind);

    if (!storedProcess) {
      throw new ProcessManagerError(
        'PROCESS_NOT_FOUND',
        'Nenhum processo gerenciado foi encontrado.',
      );
    }

    if (storedProcess.pid === undefined) {
      return storedProcess;
    }

    if (!isManagedProcessAlive(storedProcess.pid)) {
      const stoppedProcess = terminalProcess(storedProcess, 'stopped');
      await writeStoredProcess(context, stoppedProcess);
      return stoppedProcess;
    }

    const processMatches = await verifyProcessDirectory(storedProcess);

    if (!processMatches) {
      throw new ProcessManagerError(
        'PROCESS_IDENTITY_MISMATCH',
        'O PID salvo pertence a outro processo e não será encerrado.',
      );
    }

    const stoppingProcess: StoredProcess = {
      ...storedProcess,
      status: 'stopping',
    };

    await writeStoredProcess(context, stoppingProcess);
    sendSignal(storedProcess.pid, 'SIGTERM');

    const exitedGracefully = await exitTracker.waitForManagedExit(
      projectId,
      kind,
      storedProcess.pid,
      5_000,
    );

    if (!exitedGracefully) {
      sendSignal(storedProcess.pid, 'SIGKILL');

      const exitedAfterKill = await exitTracker.waitForManagedExit(
        projectId,
        kind,
        storedProcess.pid,
        2_000,
        true,
      );

      if (!exitedAfterKill) {
        throw new ProcessManagerError(
          'PROCESS_STOP_TIMEOUT',
          'O grupo de processos continua ativo após a tentativa de encerramento.',
        );
      }
    }

    const stoppedProcess = terminalProcess(storedProcess, 'stopped');
    await writeStoredProcess(context, stoppedProcess);
    return stoppedProcess;
  }

  return {
    startManagedServer,
    startManagedTest,
    startManagedWorker,
    stopManagedProcess,
    sendSignal,
  };
}
