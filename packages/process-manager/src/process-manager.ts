import { spawn } from 'node:child_process';

import { createHash, randomBytes } from 'node:crypto';

import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  truncate,
  writeFile,
} from 'node:fs/promises';

import { createConnection, createServer } from 'node:net';

import { homedir, networkInterfaces } from 'node:os';

import path from 'node:path';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  ProcessLogSnapshot,
  Project,
} from '@dev-dashboard/contracts';

import { sweepStaleProcesses } from './log-retention.js';
import { maskSensitiveLogContent } from './log-protection.js';

type ManagedKind = 'server' | 'test';

import {
  isManagedProcessAlive,
  isStoredProcess,
  type StoredProcess,
  verifyProcessDirectory,
} from './process-state.js';


interface ResolvedCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface StartServerOptions {
  port?: number;
}

export interface ReadServerLogOptions {
  maxBytes?: number;
}

export type ProcessManagerErrorCode =
  | 'PROCESS_ALREADY_RUNNING'
  | 'PROCESS_NOT_FOUND'
  | 'PROCESS_IDENTITY_MISMATCH'
  | 'PROJECT_SERVER_UNSUPPORTED'
  | 'PROJECT_SCRIPT_NOT_FOUND'
  | 'INVALID_PORT'
  | 'PORT_NOT_AVAILABLE'
  | 'INVALID_LOG_LIMIT'
  | 'PROCESS_STOP_TIMEOUT';

export class ProcessManagerError extends Error {
  public readonly code: ProcessManagerErrorCode;

  public constructor(code: ProcessManagerErrorCode, message: string) {
    super(message);

    this.name = 'ProcessManagerError';
    this.code = code;
  }
}

interface PackageManifest {
  scripts?: Record<string, string>;
}

interface ObservedExit {
  pid: number;
  exitCode?: number | null;
}

function resolveStateDirectory(): string {
  const configuredDirectory =
    process.env.DEV_DASHBOARD_STATE_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  const xdgStateHome = process.env.XDG_STATE_HOME?.trim();

  if (xdgStateHome) {
    return path.join(path.resolve(xdgStateHome), 'dev-dashboard');
  }

  return path.join(homedir(), '.local', 'state', 'dev-dashboard');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new ProcessManagerError(
      'INVALID_PORT',
      'A porta deve estar entre 1024 e 65535.',
    );
  }
}

const SERVER_BIND_HOST = '0.0.0.0';

function isIpv4Family(family: string | number): boolean {
  return family === 'IPv4' || family === 4;
}

function listServerUrls(port: number): string[] {
  const urls = new Set<string>([
    `http://localhost:${port}`,
  ]);

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (
        !isIpv4Family(address.family) ||
        address.internal ||
        address.address === '0.0.0.0'
      ) {
        continue;
      }

      urls.add(`http://${address.address}:${port}`);
    }
  }

  return [...urls];
}

async function canConnect(
  host: string,
  port: number,
  timeoutMs = 250,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (connected: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function terminalProcess(
  storedProcess: StoredProcess,
  status: Extract<ManagedProcessStatus, 'stopped' | 'failed'>,
  exitCode?: number | null,
): StoredProcess {
  const {
    pid: _pid,
    exitCode: _previousExitCode,
    stoppedAt: _previousStoppedAt,
    ...rest
  } = storedProcess;

  return {
    ...rest,
    status,
    stoppedAt: new Date().toISOString(),
    ...(exitCode !== undefined && exitCode !== null
      ? { exitCode }
      : {}),
  };
}

async function canListen(
  host: string,
  port: number,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();

    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(
      {
        host,
        port,
      },
      () => {
        server.close(() => {
          resolve(true);
        });
      },
    );
  });
}

async function findAvailablePort(
  host: string,
  initialPort = 3000,
  finalPort = 3999,
): Promise<number> {
  for (let port = initialPort; port <= finalPort; port += 1) {
    if (await canListen(host, port)) {
      return port;
    }
  }

  throw new Error(
    `Nenhuma porta livre encontrada entre ${initialPort} e ${finalPort}.`,
  );
}

async function readPackageManifest(
  projectPath: string,
): Promise<PackageManifest | null> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );

    const parsed: unknown = JSON.parse(contents);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;

    if (
      typeof candidate.scripts !== 'object' ||
      candidate.scripts === null ||
      Array.isArray(candidate.scripts)
    ) {
      return {};
    }

    const scripts = Object.fromEntries(
      Object.entries(candidate.scripts).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string',
      ),
    );

    return {
      scripts,
    };
  } catch {
    return null;
  }
}

type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

async function resolveNodePackageManager(
  projectPath: string,
): Promise<NodePackageManager> {
  if (await pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  if (await pathExists(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }

  if (
    (await pathExists(path.join(projectPath, 'bun.lock'))) ||
    (await pathExists(path.join(projectPath, 'bun.lockb')))
  ) {
    return 'bun';
  }

  return 'npm';
}

async function resolveNodeCommand(
  project: Project,
  host: string,
  port: number,
): Promise<ResolvedCommand> {
  const manifest = await readPackageManifest(project.path);

  const scripts = manifest?.scripts ?? {};

  const scriptName = ['dev', 'start', 'serve'].find(
    (candidate) => candidate in scripts,
  );

  if (!scriptName) {
    throw new ProcessManagerError(
      'PROJECT_SCRIPT_NOT_FOUND',
      `Nenhum script dev, start ou serve foi encontrado em ${project.name}.`,
    );
  }

  const packageManager = await resolveNodePackageManager(
    project.path,
  );

  const scriptCommand = scripts[scriptName] ?? '';
  const forwardedArgs: string[] = [];

  if (/\b(vite|nuxt|astro)\b/i.test(scriptCommand)) {
    forwardedArgs.push(
      '--host',
      host,
      '--port',
      String(port),
    );
  } else if (/\bnext\b/i.test(scriptCommand)) {
    forwardedArgs.push(
      '--hostname',
      host,
      '--port',
      String(port),
    );
  }

  // npm exige `--` para encaminhar opções ao script. pnpm, Yarn e
  // Bun encaminham os argumentos diretamente; incluir `--` nesses
  // gerenciadores faz frameworks como Next interpretarem a opção
  // seguinte como o diretório do projeto.
  const args = [
    'run',
    scriptName,
    ...(forwardedArgs.length === 0
      ? []
      : packageManager === 'npm'
        ? ['--', ...forwardedArgs]
        : forwardedArgs),
  ];

  return {
    command: packageManager,
    args,
    env: {
      PORT: String(port),
      HOST: host,
      ...(packageManager === 'pnpm'
        ? {
            // O processo é destacado e não possui TTY. pnpm precisa
            // receber uma confirmação não interativa quando decide
            // recriar node_modules antes de executar predev/dev.
            CI: 'true',
            pnpm_config_confirmModulesPurge: 'false',
          }
        : {}),
    },
  };
}

async function resolveRailsCommand(
  project: Project,
  host: string,
  port: number,
): Promise<ResolvedCommand> {
  const railsExecutable = path.join(project.path, 'bin', 'rails');

  if (await pathExists(railsExecutable)) {
    return {
      command: railsExecutable,
      args: [
        'server',
        '--binding',
        host,
        '--port',
        String(port),
      ],
      env: {},
    };
  }

  return {
    command: 'bundle',
    args: [
      'exec',
      'rails',
      'server',
      '--binding',
      host,
      '--port',
      String(port),
    ],
    env: {},
  };
}

async function resolveServerCommand(
  project: Project,
  host: string,
  port: number,
): Promise<ResolvedCommand> {
  switch (project.type) {
    case 'rails':
      return await resolveRailsCommand(project, host, port);

    case 'node':
      return await resolveNodeCommand(project, host, port);

    default:
      throw new ProcessManagerError(
        'PROJECT_SERVER_UNSUPPORTED',
        `O projeto ${project.name} não possui servidor suportado.`,
      );
  }
}

async function waitForProcessExit(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isManagedProcessAlive(pid)) {
      return true;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return !isManagedProcessAlive(pid);
}

export class ProcessManager {
  public readonly stateDirectory: string;
  private readonly processDirectory: string;
  private readonly logDirectory: string;
  private readonly observedExits = new Map<string, ObservedExit>();
  private readonly exitWaiters = new Map<
    string,
    {
      pid: number;
      promise: Promise<ObservedExit>;
    }
  >();
  private readonly startLocks = new Map<string, Promise<unknown>>();

  private async withStartLock<T>(
    projectId: string,
    kind: ManagedKind,
    action: () => Promise<T>,
  ): Promise<T> {
    const key = `${projectId}:${kind}`;
    const previous = this.startLocks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.startLocks.set(key, tail);
    try {
      return await current;
    } finally {
      if (this.startLocks.get(key) === tail) {
        this.startLocks.delete(key);
      }
    }
  }

  public constructor(stateDirectory = resolveStateDirectory()) {
    this.stateDirectory = stateDirectory;

    this.processDirectory = path.join(stateDirectory, 'processes');

    this.logDirectory = path.join(stateDirectory, 'logs');
  }

  public getServerProcess(
    projectId: string,
  ): Promise<ManagedProcess | null> {
    return this.getManagedProcess(projectId, 'server');
  }

  public getTestProcess(
    projectId: string,
  ): Promise<ManagedProcess | null> {
    return this.getManagedProcess(projectId, 'test');
  }

  private async getManagedProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ManagedProcess | null> {
    const storedProcess = await this.readStoredProcess(projectId, kind);

    if (!storedProcess) {
      return null;
    }

    if (
      storedProcess.status === 'running' ||
      storedProcess.status === 'starting' ||
      storedProcess.status === 'stopping'
    ) {
      const running =
        storedProcess.pid !== undefined &&
        isManagedProcessAlive(storedProcess.pid) &&
        (await verifyProcessDirectory(storedProcess));

      if (!running) {
        const observedExit =
          storedProcess.pid !== undefined
            ? await this.waitForObservedExit(
                projectId,
                kind,
                storedProcess.pid,
              )
            : undefined;
        const exitCode = observedExit?.exitCode;

        const finalStatus: 'stopped' | 'failed' =
          storedProcess.status === 'stopping'
            ? 'stopped'
            : kind === 'test' && exitCode === 0
              ? 'stopped'
              : 'failed';

        const finishedProcess = terminalProcess(
          storedProcess,
          finalStatus,
          exitCode,
        );

        await this.writeStoredProcess(finishedProcess);

        if (storedProcess.pid !== undefined) {
          this.clearObservedExit(projectId, kind, storedProcess.pid);
        }

        return finishedProcess;
      }

      if (
        kind === 'server' &&
        storedProcess.status === 'starting' &&
        storedProcess.port !== undefined &&
        (await canConnect('127.0.0.1', storedProcess.port))
      ) {
        const runningProcess: StoredProcess = {
          ...storedProcess,
          status: 'running',
        };

        await this.writeStoredProcess(runningProcess);

        return runningProcess;
      }
    }

    if (
      (storedProcess.status === 'stopped' ||
        storedProcess.status === 'failed') &&
      storedProcess.pid !== undefined
    ) {
      const normalizedProcess = terminalProcess(
        storedProcess,
        storedProcess.status,
        storedProcess.exitCode,
      );

      await this.writeStoredProcess(normalizedProcess);
      return normalizedProcess;
    }

    return storedProcess;
  }

  public async listProcesses(): Promise<ManagedProcess[]> {
    const entries = await readdir(this.processDirectory, {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return [];
      }

      throw error;
    });

    const processes: ManagedProcess[] = [];

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !/\.(server|test)\.json$/.test(entry.name)
      ) {
        continue;
      }

      const contents = await readFile(
        path.join(this.processDirectory, entry.name),
        'utf8',
      );

      const parsed: unknown = JSON.parse(contents);

      if (!isStoredProcess(parsed)) {
        throw new Error(
          `O arquivo de estado ${entry.name} possui formato inválido.`,
        );
      }

      const managedProcess = await this.getManagedProcess(
        parsed.projectId,
        parsed.kind as ManagedKind,
      );

      if (managedProcess) {
        processes.push(managedProcess);
      }
    }

    return processes.sort((left, right) =>
      left.projectId.localeCompare(right.projectId),
    );
  }

  public readServerLog(
    projectId: string,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    return this.readLog(projectId, 'server', options);
  }

  public readTestLog(
    projectId: string,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    return this.readLog(projectId, 'test', options);
  }

  private async readLog(
    projectId: string,
    kind: ManagedKind,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    const storedProcess = await this.readStoredProcess(projectId, kind);

    if (!storedProcess) {
      throw new ProcessManagerError(
        'PROCESS_NOT_FOUND',
        'Nenhum processo gerenciado foi encontrado.',
      );
    }

    const maxBytes = options.maxBytes ?? 65_536;

    if (
      !Number.isInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 262_144
    ) {
      throw new ProcessManagerError(
        'INVALID_LOG_LIMIT',
        'O limite do log deve estar entre 1 e 262144 bytes.',
      );
    }

    try {
      const logPath = this.resolveLogFile(projectId, kind);

      const logStats = await stat(logPath);

      const startPosition = Math.max(0, logStats.size - maxBytes);

      const length = logStats.size - startPosition;
      const buffer = Buffer.alloc(length);

      const logHandle = await open(logPath, 'r');

      try {
        await logHandle.read(buffer, 0, length, startPosition);
      } finally {
        await logHandle.close();
      }

      let content = buffer.toString('utf8');
      const truncated = startPosition > 0;

      // Quando começamos no meio do arquivo, removemos
      // a primeira linha possivelmente incompleta.
      if (truncated) {
        const firstLineBreak = content.indexOf('\n');

        if (firstLineBreak >= 0) {
          content = content.slice(firstLineBreak + 1);
        }
      }

      const maskedContent = maskSensitiveLogContent(content);

      return {
        projectId,
        processId: storedProcess.id,
        content: maskedContent.content,
        masked: maskedContent.masked,
        redactionCount: maskedContent.redactionCount,
        sizeBytes: logStats.size,
        truncated,
        updatedAt: logStats.mtime.toISOString(),
        readAt: new Date().toISOString(),
      };
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return {
          projectId,
          processId: storedProcess.id,
          content: '',
          sizeBytes: 0,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: new Date().toISOString(),
        };
      }

      throw error;
    }
  }

  public clearServerLog(
    projectId: string,
  ): Promise<ProcessLogSnapshot> {
    return this.clearLog(projectId, 'server');
  }

  public clearTestLog(
    projectId: string,
  ): Promise<ProcessLogSnapshot> {
    return this.clearLog(projectId, 'test');
  }

  private async clearLog(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ProcessLogSnapshot> {
    const storedProcess = await this.readStoredProcess(projectId, kind);

    if (!storedProcess) {
      throw new ProcessManagerError(
        'PROCESS_NOT_FOUND',
        'Nenhum processo gerenciado foi encontrado.',
      );
    }

    const logPath = this.resolveLogFile(projectId, kind);

    try {
      await truncate(logPath, 0);

      const logStats = await stat(logPath);

      return {
        projectId,
        processId: storedProcess.id,
        content: '',
        sizeBytes: 0,
        truncated: false,
        masked: false,
        redactionCount: 0,
        updatedAt: logStats.mtime.toISOString(),
        readAt: new Date().toISOString(),
      };
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return {
          projectId,
          processId: storedProcess.id,
          content: '',
          sizeBytes: 0,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: new Date().toISOString(),
        };
      }

      throw error;
    }
  }

  public startServer(
    project: Project,
    options: StartServerOptions = {},
  ): Promise<ManagedProcess> {
    return this.withStartLock(project.id, 'server', () =>
      this.startServerLocked(project, options),
    );
  }

  private async startServerLocked(
    project: Project,
    options: StartServerOptions,
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(this.stateDirectory);
    } catch {
      // A limpeza é best-effort: uma falha aqui nunca deve impedir o start.
    }

    const currentProcess = await this.getServerProcess(project.id);

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
      mkdir(this.processDirectory, {
        recursive: true,
        mode: 0o700,
      }),
      mkdir(this.logDirectory, {
        recursive: true,
        mode: 0o700,
      }),
    ]);

    const logPath = this.resolveLogFile(project.id, 'server');

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
      await this.writeStoredProcess(managedProcess);
    } catch (error) {
      try {
        this.sendSignal(child.pid, 'SIGKILL');
      } catch {
        // A falha de persistência original deve ser preservada.
      }

      throw error;
    }

    this.observeChild(child, managedProcess);
    child.unref();

    return managedProcess;
  }

  public stopServer(
    projectId: string,
  ): Promise<ManagedProcess> {
    return this.stopManagedProcess(projectId, 'server');
  }

  public stopTest(
    projectId: string,
  ): Promise<ManagedProcess> {
    return this.stopManagedProcess(projectId, 'test');
  }

  private async stopManagedProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ManagedProcess> {
    const storedProcess = await this.readStoredProcess(projectId, kind);

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

      await this.writeStoredProcess(stoppedProcess);

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

    await this.writeStoredProcess(stoppingProcess);

    this.sendSignal(storedProcess.pid, 'SIGTERM');

    const exitedGracefully = await this.waitForManagedExit(
      projectId,
      kind,
      storedProcess.pid,
      5_000,
    );

    if (!exitedGracefully) {
      this.sendSignal(storedProcess.pid, 'SIGKILL');

      const exitedAfterKill = await this.waitForManagedExit(
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

    const stoppedProcess = terminalProcess(
      storedProcess,
      'stopped',
    );

    await this.writeStoredProcess(stoppedProcess);

    return stoppedProcess;
  }

  private observeChild(
    child: ReturnType<typeof spawn>,
    managedProcess: StoredProcess,
  ): void {
    let recorded = false;
    let resolveExit!: (observation: ObservedExit) => void;

    const exitPromise = new Promise<ObservedExit>((resolve) => {
      resolveExit = resolve;
    });

    const pid = managedProcess.pid as number;

    const key = `${managedProcess.projectId}:${managedProcess.kind}`;

    this.exitWaiters.set(key, {
      pid,
      promise: exitPromise,
    });

    const record = (exitCode?: number | null): void => {
      if (recorded) {
        return;
      }

      recorded = true;

      const observation: ObservedExit = {
        pid,
        ...(exitCode !== undefined ? { exitCode } : {}),
      };

      this.observedExits.set(key, observation);
      resolveExit(observation);

      void this.recordChildExit(
        managedProcess.projectId,
        managedProcess.kind as ManagedKind,
        pid,
        exitCode,
      ).catch(() => undefined);
    };

    child.once('exit', (code) => record(code));
    child.once('error', () => record(undefined));

    if (child.exitCode !== null || child.signalCode !== null) {
      record(child.exitCode);
    }
  }

  private async waitForObservedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    timeoutMs = 1_000,
  ): Promise<ObservedExit | undefined> {
    const key = `${projectId}:${kind}`;
    const existing = this.observedExits.get(key);

    if (existing?.pid === pid) {
      return existing;
    }

    const waiter = this.exitWaiters.get(key);

    if (!waiter || waiter.pid !== pid) {
      return undefined;
    }

    return await Promise.race([
      waiter.promise,
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  }

  private async waitForManagedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    timeoutMs: number,
    acceptObservedExit = false,
  ): Promise<boolean> {
    const observedExit = this.waitForObservedExit(
      projectId,
      kind,
      pid,
      timeoutMs,
    ).then((observation) =>
      observation !== undefined
        ? acceptObservedExit || !isManagedProcessAlive(pid)
        : false,
    );

    const groupExit = waitForProcessExit(pid, timeoutMs);

    return await Promise.race([observedExit, groupExit]);
  }

  private clearObservedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
  ): void {
    const key = `${projectId}:${kind}`;
    if (this.observedExits.get(key)?.pid === pid) {
      this.observedExits.delete(key);
    }

    if (this.exitWaiters.get(key)?.pid === pid) {
      this.exitWaiters.delete(key);
    }
  }

  private async recordChildExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    exitCode?: number | null,
  ): Promise<void> {
    const currentProcess = await this.readStoredProcess(projectId, kind);

    if (!currentProcess) {
      this.clearObservedExit(projectId, kind, pid);
      return;
    }

    if (currentProcess.pid !== pid) {
      if (
        currentProcess.pid === undefined &&
        (currentProcess.status === 'stopped' ||
          currentProcess.status === 'failed') &&
        currentProcess.exitCode === undefined &&
        exitCode !== undefined &&
        exitCode !== null
      ) {
        await this.writeStoredProcess({
          ...currentProcess,
          exitCode,
        });
      }

      this.clearObservedExit(projectId, kind, pid);
      return;
    }

    const status =
      currentProcess.status === 'stopping' ||
      (currentProcess.status === 'running' && exitCode === 0)
        ? 'stopped'
        : 'failed';

    await this.writeStoredProcess(
      terminalProcess(currentProcess, status, exitCode),
    );

    this.clearObservedExit(projectId, kind, pid);
  }

  private sendSignal(pid: number, signal: NodeJS.Signals): void {
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

  private createProjectKey(projectId: string): string {
    const readable = projectId
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 80);

    const hash = createHash('sha256')
      .update(projectId)
      .digest('hex')
      .slice(0, 8);

    return `${readable}-${hash}`;
  }

  private resolveLogFile(projectId: string, kind: ManagedKind): string {
    return path.join(
      this.logDirectory,
      `${this.createProjectKey(projectId)}.${kind}.log`,
    );
  }

  private resolveProcessFile(
    projectId: string,
    kind: ManagedKind,
  ): string {
    return path.join(
      this.processDirectory,
      `${this.createProjectKey(projectId)}.${kind}.json`,
    );
  }

  private async readStoredProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<StoredProcess | null> {
    try {
      const contents = await readFile(
        this.resolveProcessFile(projectId, kind),
        'utf8',
      );

      const parsed: unknown = JSON.parse(contents);

      if (!isStoredProcess(parsed)) {
        throw new Error(
          'O arquivo de estado do processo possui formato inválido.',
        );
      }

      return parsed;
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  private async writeStoredProcess(
    managedProcess: StoredProcess,
  ): Promise<void> {
    await mkdir(this.processDirectory, {
      recursive: true,
      mode: 0o700,
    });

    const processFile = this.resolveProcessFile(
      managedProcess.projectId,
      managedProcess.kind as ManagedKind,
    );

    const temporaryFile =
      `${processFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

    await writeFile(
      temporaryFile,
      `${JSON.stringify(managedProcess, null, 2)}\n`,
      {
        encoding: 'utf8',
        mode: 0o600,
      },
    );

    await rename(temporaryFile, processFile);
  }

  public startTest(
    project: Project,
    command: { id: string; command: string; args: string[] },
  ): Promise<ManagedProcess> {
    return this.withStartLock(project.id, 'test', () =>
      this.startTestLocked(project, command),
    );
  }

  private async startTestLocked(
    project: Project,
    command: { id: string; command: string; args: string[] },
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(this.stateDirectory);
    } catch {
      // best-effort
    }

    const currentProcess = await this.getTestProcess(project.id);

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
      mkdir(this.processDirectory, {
        recursive: true,
        mode: 0o700,
      }),
      mkdir(this.logDirectory, {
        recursive: true,
        mode: 0o700,
      }),
    ]);

    const logPath = this.resolveLogFile(project.id, 'test');

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
      await this.writeStoredProcess(managedProcess);
    } catch (error) {
      try {
        this.sendSignal(child.pid, 'SIGKILL');
      } catch {
        // preserva o erro original
      }

      throw error;
    }

    this.observeChild(child, managedProcess);
    child.unref();

    return managedProcess;
  }
}
