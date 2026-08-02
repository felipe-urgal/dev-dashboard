import { spawn } from 'node:child_process';

import { mkdir, open } from 'node:fs/promises';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import { resolveServerCommand } from './command-resolution.js';
import { isErrnoException, ProcessManagerError } from './errors.js';
import { sweepStaleProcesses } from './log-retention.js';
import {
  canListen,
  findAvailablePort,
  listServerUrls,
  SERVER_BIND_HOST,
  validatePort,
} from './port-utils.js';
import { isManagedProcessAlive, verifyProcessDirectory } from './process-state.js';
import type { ExitTracker } from './process-exit-tracking.js';
import type { ProcessStatusReader } from './process-status.js';
import {
  readStoredProcess,
  resolveLogFile,
  terminalProcess,
  writeStoredProcess,
  type ManagedKind,
  type ProcessStoreContext,
} from './process-store.js';
import type { StoredProcess } from './process-state.js';

export interface StartServerOptions {
  port?: number;
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
  startManagedComposeBuild(
    project: Project,
    serviceName: string,
    command: { command: string; args: string[] },
    stateDirectory: string,
  ): Promise<ManagedProcess>;
  stopManagedProcess(
    projectId: string,
    kind: ManagedKind,
    instance?: string,
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

  async function startManagedServer(
    project: Project,
    options: StartServerOptions,
    stateDirectory: string,
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(stateDirectory);
    } catch {
      // A limpeza é best-effort: uma falha aqui nunca deve impedir o start.
    }

    const currentProcess = await statusReader.getManagedProcess(
      project.id,
      'server',
    );

    if (
      currentProcess?.status === 'running' ||
      currentProcess?.status === 'starting' ||
      currentProcess?.status === 'stopping'
    ) {
      throw new ProcessManagerError(
        'PROCESS_ALREADY_RUNNING',
        `O servidor de ${project.name} já está em execução.`,
      );
    }

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

    const port =
      requestedPort ??
      (await findAvailablePort(SERVER_BIND_HOST));

    const resolvedCommand = await resolveServerCommand(
      project,
      SERVER_BIND_HOST,
      port,
    );

    await Promise.all([
      mkdir(context.processDirectory, {
        recursive: true,
        mode: 0o700,
      }),
      mkdir(context.logDirectory, {
        recursive: true,
        mode: 0o700,
      }),
    ]);

    const logPath = resolveLogFile(context, project.id, 'server');

    const logHandle = await open(logPath, 'a', 0o600);

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(resolvedCommand.command, resolvedCommand.args, {
        cwd: project.path,
        detached: true,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', logHandle.fd, logHandle.fd],
        env: {
          ...process.env,
          ...resolvedCommand.env,
        },
      });

      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } finally {
      await logHandle.close();
    }

    if (!child.pid) {
      throw new Error(
        `Não foi possível obter o PID do servidor de ${project.name}.`,
      );
    }

    const primaryUrl = `http://localhost:${port}`;
    const urls = listServerUrls(port);

    const managedProcess: StoredProcess = {
      id: `${project.id}:server`,
      projectId: project.id,
      ...(project.workspaceId
        ? { workspaceId: project.workspaceId }
        : {}),
      kind: 'server',
      status: 'starting',
      pid: child.pid,
      port,
      url: primaryUrl,
      urls,
      command: resolvedCommand.command,
      args: resolvedCommand.args,
      cwd: project.path,
      logPath,
      startedAt: new Date().toISOString(),
    };

    try {
      await writeStoredProcess(context, managedProcess);
    } catch (error) {
      try {
        sendSignal(child.pid, 'SIGKILL');
      } catch {
        // A falha de persistência original deve ser preservada.
      }

      throw error;
    }

    exitTracker.observeChild(child, managedProcess);
    child.unref();

    return managedProcess;
  }

  async function startManagedTest(
    project: Project,
    command: { id: string; command: string; args: string[] },
    stateDirectory: string,
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(stateDirectory);
    } catch {
      // best-effort
    }

    const currentProcess = await statusReader.getManagedProcess(
      project.id,
      'test',
    );

    if (
      currentProcess?.status === 'running' ||
      currentProcess?.status === 'starting' ||
      currentProcess?.status === 'stopping'
    ) {
      throw new ProcessManagerError(
        'PROCESS_ALREADY_RUNNING',
        `Já existe uma execução de testes em andamento para ${project.name}.`,
      );
    }

    await Promise.all([
      mkdir(context.processDirectory, {
        recursive: true,
        mode: 0o700,
      }),
      mkdir(context.logDirectory, {
        recursive: true,
        mode: 0o700,
      }),
    ]);

    const logPath = resolveLogFile(context, project.id, 'test');

    const logHandle = await open(logPath, 'a', 0o600);

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command.command, command.args, {
        cwd: project.path,
        detached: true,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', logHandle.fd, logHandle.fd],
        env: {
          ...process.env,
          CI: 'true',
        },
      });

      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } finally {
      await logHandle.close();
    }

    if (!child.pid) {
      throw new Error(
        `Não foi possível obter o PID da execução de testes de ${project.name}.`,
      );
    }

    const managedProcess: StoredProcess = {
      id: `${project.id}:test:${command.id}`,
      projectId: project.id,
      ...(project.workspaceId
        ? { workspaceId: project.workspaceId }
        : {}),
      kind: 'test',
      status: 'running',
      pid: child.pid,
      command: command.command,
      args: command.args,
      cwd: project.path,
      logPath,
      startedAt: new Date().toISOString(),
    };

    try {
      await writeStoredProcess(context, managedProcess);
    } catch (error) {
      try {
        sendSignal(child.pid, 'SIGKILL');
      } catch {
        // preserva o erro original
      }

      throw error;
    }

    exitTracker.observeChild(child, managedProcess);
    child.unref();

    return managedProcess;
  }

  async function startManagedComposeBuild(
    project: Project,
    serviceName: string,
    command: { command: string; args: string[] },
    stateDirectory: string,
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(stateDirectory);
    } catch {
      // best-effort
    }

    const currentProcess = await statusReader.getManagedProcess(
      project.id,
      'compose-build',
      serviceName,
    );

    if (
      currentProcess?.status === 'running' ||
      currentProcess?.status === 'starting' ||
      currentProcess?.status === 'stopping'
    ) {
      throw new ProcessManagerError(
        'PROCESS_ALREADY_RUNNING',
        `Já existe um build em andamento para o serviço ${serviceName}.`,
      );
    }

    await Promise.all([
      mkdir(context.processDirectory, {
        recursive: true,
        mode: 0o700,
      }),
      mkdir(context.logDirectory, {
        recursive: true,
        mode: 0o700,
      }),
    ]);

    const logPath = resolveLogFile(context, project.id, 'compose-build', serviceName);

    const logHandle = await open(logPath, 'a', 0o600);

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command.command, command.args, {
        cwd: project.path,
        detached: true,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', logHandle.fd, logHandle.fd],
        env: process.env,
      });

      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } finally {
      await logHandle.close();
    }

    if (!child.pid) {
      throw new Error(
        `Não foi possível obter o PID do build do serviço ${serviceName}.`,
      );
    }

    const managedProcess: StoredProcess = {
      id: `${project.id}:compose-build:${serviceName}`,
      projectId: project.id,
      ...(project.workspaceId
        ? { workspaceId: project.workspaceId }
        : {}),
      kind: 'compose-build',
      status: 'running',
      pid: child.pid,
      command: command.command,
      args: command.args,
      cwd: project.path,
      logPath,
      startedAt: new Date().toISOString(),
      composeServiceName: serviceName,
    };

    try {
      await writeStoredProcess(context, managedProcess);
    } catch (error) {
      try {
        sendSignal(child.pid, 'SIGKILL');
      } catch {
        // preserva o erro original
      }

      throw error;
    }

    exitTracker.observeChild(child, managedProcess);
    child.unref();

    return managedProcess;
  }

  async function stopManagedProcess(
    projectId: string,
    kind: ManagedKind,
    instance?: string,
  ): Promise<ManagedProcess> {
    const storedProcess = await readStoredProcess(context, projectId, kind, instance);

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
      const stoppedProcess = terminalProcess(
        storedProcess,
        'stopped',
      );

      await writeStoredProcess(context, stoppedProcess);

      return stoppedProcess;
    }

    const processMatches =
      await verifyProcessDirectory(storedProcess);

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
      false,
      instance,
    );

    if (!exitedGracefully) {
      sendSignal(storedProcess.pid, 'SIGKILL');

      const exitedAfterKill = await exitTracker.waitForManagedExit(
        projectId,
        kind,
        storedProcess.pid,
        2_000,
        true,
        instance,
      );

      if (!exitedAfterKill) {
        throw new ProcessManagerError(
          'PROCESS_STOP_TIMEOUT',
          'O grupo de processos continua ativo após a tentativa de encerramento.',
        );
      }
    }

    const stoppedProcess = terminalProcess(
      storedProcess,
      'stopped',
    );

    await writeStoredProcess(context, stoppedProcess);

    return stoppedProcess;
  }

  return {
    startManagedServer,
    startManagedTest,
    startManagedComposeBuild,
    stopManagedProcess,
    sendSignal,
  };
}
