import { spawn } from 'node:child_process';

import { createHash } from 'node:crypto';

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

import { createServer } from 'node:net';

import { homedir, networkInterfaces } from 'node:os';

import path from 'node:path';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
} from '@dev-dashboard/contracts';

import { sweepStaleProcesses } from './log-retention.js';

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

  public constructor(stateDirectory = resolveStateDirectory()) {
    this.stateDirectory = stateDirectory;

    this.processDirectory = path.join(stateDirectory, 'processes');

    this.logDirectory = path.join(stateDirectory, 'logs');
  }

  public async getServerProcess(
    projectId: string,
  ): Promise<ManagedProcess | null> {
    const storedProcess = await this.readStoredProcess(projectId);

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
        const stoppedProcess: StoredProcess = {
          ...storedProcess,
          status: 'stopped',
          stoppedAt: new Date().toISOString(),
        };

        await this.writeStoredProcess(stoppedProcess);

        return stoppedProcess;
      }
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
      if (!entry.isFile() || !entry.name.endsWith('.server.json')) {
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

      const managedProcess = await this.getServerProcess(
        parsed.projectId,
      );

      if (managedProcess) {
        processes.push(managedProcess);
      }
    }

    return processes.sort((left, right) =>
      left.projectId.localeCompare(right.projectId),
    );
  }

  public async readServerLog(
    projectId: string,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    const storedProcess = await this.readStoredProcess(projectId);

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
      const logPath = this.resolveLogFile(projectId);

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

      return {
        projectId,
        processId: storedProcess.id,
        content,
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
          readAt: new Date().toISOString(),
        };
      }

      throw error;
    }
  }

  public async clearServerLog(
    projectId: string,
  ): Promise<ProcessLogSnapshot> {
    const storedProcess = await this.readStoredProcess(projectId);

    if (!storedProcess) {
      throw new ProcessManagerError(
        'PROCESS_NOT_FOUND',
        'Nenhum processo gerenciado foi encontrado.',
      );
    }

    const logPath = this.resolveLogFile(projectId);

    try {
      await truncate(logPath, 0);

      const logStats = await stat(logPath);

      return {
        projectId,
        processId: storedProcess.id,
        content: '',
        sizeBytes: 0,
        truncated: false,
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
          readAt: new Date().toISOString(),
        };
      }

      throw error;
    }
  }

  public async startServer(
    project: Project,
    options: StartServerOptions = {},
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(this.stateDirectory);
    } catch {
      // A limpeza é best-effort: uma falha aqui nunca deve impedir o start.
    }

    const currentProcess = await this.getServerProcess(project.id);

    if (
      currentProcess?.status === 'running' ||
      currentProcess?.status === 'starting'
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

    const logPath = this.resolveLogFile(project.id);

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

    child.unref();

    const primaryUrl = `http://localhost:${port}`;
    const urls = listServerUrls(port);

    const managedProcess: StoredProcess = {
      id: `${project.id}:server`,
      projectId: project.id,
      ...(project.workspaceId
        ? { workspaceId: project.workspaceId }
        : {}),
      kind: 'server',
      status: 'running',
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

    await this.writeStoredProcess(managedProcess);

    return managedProcess;
  }

  public async stopServer(
    projectId: string,
  ): Promise<ManagedProcess> {
    const storedProcess = await this.readStoredProcess(projectId);

    if (!storedProcess || storedProcess.pid === undefined) {
      throw new ProcessManagerError(
        'PROCESS_NOT_FOUND',
        'Nenhum processo gerenciado foi encontrado.',
      );
    }

    if (!isManagedProcessAlive(storedProcess.pid)) {
      const stoppedProcess: StoredProcess = {
        ...storedProcess,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
      };

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

    const exitedGracefully = await waitForProcessExit(
      storedProcess.pid,
      5_000,
    );

    if (!exitedGracefully) {
      this.sendSignal(storedProcess.pid, 'SIGKILL');

      const exitedAfterKill = await waitForProcessExit(
        storedProcess.pid,
        2_000,
      );

      if (!exitedAfterKill) {
        throw new ProcessManagerError(
          'PROCESS_STOP_TIMEOUT',
          'O grupo de processos continua ativo após a tentativa de encerramento.',
        );
      }
    }

    const stoppedProcess: StoredProcess = {
      ...storedProcess,
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    };

    await this.writeStoredProcess(stoppedProcess);

    return stoppedProcess;
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

  private resolveLogFile(projectId: string): string {
    return path.join(
      this.logDirectory,
      `${this.createProjectKey(projectId)}.server.log`,
    );
  }

  private resolveProcessFile(projectId: string): string {
    return path.join(
      this.processDirectory,
      `${this.createProjectKey(projectId)}.server.json`,
    );
  }

  private async readStoredProcess(
    projectId: string,
  ): Promise<StoredProcess | null> {
    try {
      const contents = await readFile(
        this.resolveProcessFile(projectId),
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
    );

    const temporaryFile = `${processFile}.${process.pid}.tmp`;

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
}
