import {
  spawn
} from "node:child_process";

import {
  createHash
} from "node:crypto";

import {
  access,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  writeFile
} from "node:fs/promises";

import {
  createServer
} from "node:net";

import {
  homedir
} from "node:os";

import path from "node:path";

import type {
  ManagedProcess,
  Project
} from "@dev-dashboard/contracts";

interface StoredProcess extends ManagedProcess {
  command: string;
  args: string[];
  cwd: string;
  logPath: string;
}

interface ResolvedCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface StartServerOptions {
  port?: number;
}

export type ProcessManagerErrorCode =
  | "PROCESS_ALREADY_RUNNING"
  | "PROCESS_NOT_FOUND"
  | "PROCESS_IDENTITY_MISMATCH"
  | "PROJECT_SERVER_UNSUPPORTED"
  | "PROJECT_SCRIPT_NOT_FOUND"
  | "INVALID_PORT";

export class ProcessManagerError extends Error {
  public readonly code: ProcessManagerErrorCode;

  public constructor(
    code: ProcessManagerErrorCode,
    message: string
  ) {
    super(message);

    this.name = "ProcessManagerError";
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

  const xdgStateHome =
    process.env.XDG_STATE_HOME?.trim();

  if (xdgStateHome) {
    return path.join(
      path.resolve(xdgStateHome),
      "dev-dashboard"
    );
  }

  return path.join(
    homedir(),
    ".local",
    "state",
    "dev-dashboard"
  );
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
  error: unknown
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error
  );
}

function validatePort(port: number): void {
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new ProcessManagerError(
      "INVALID_PORT",
      `Porta inválida: ${port}`
    );
  }
}

async function canListen(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();

    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.listen(
      {
        host: "127.0.0.1",
        port
      },
      () => {
        server.close(() => {
          resolve(true);
        });
      }
    );
  });
}

async function findAvailablePort(
  initialPort = 3000,
  finalPort = 3999
): Promise<number> {
  for (
    let port = initialPort;
    port <= finalPort;
    port += 1
  ) {
    if (await canListen(port)) {
      return port;
    }
  }

  throw new Error(
    `Nenhuma porta livre encontrada entre ${initialPort} e ${finalPort}.`
  );
}

async function readPackageManifest(
  projectPath: string
): Promise<PackageManifest | null> {
  try {
    const contents = await readFile(
      path.join(projectPath, "package.json"),
      "utf8"
    );

    const parsed: unknown = JSON.parse(contents);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const candidate =
      parsed as Record<string, unknown>;

    if (
      typeof candidate.scripts !== "object" ||
      candidate.scripts === null ||
      Array.isArray(candidate.scripts)
    ) {
      return {};
    }

    const scripts = Object.fromEntries(
      Object.entries(candidate.scripts).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string"
      )
    );

    return {
      scripts
    };
  } catch {
    return null;
  }
}

async function resolveNodePackageManager(
  projectPath: string
): Promise<string> {
  if (
    await pathExists(
      path.join(projectPath, "pnpm-lock.yaml")
    )
  ) {
    return "pnpm";
  }

  if (
    await pathExists(
      path.join(projectPath, "yarn.lock")
    )
  ) {
    return "yarn";
  }

  if (
    await pathExists(
      path.join(projectPath, "bun.lock")
    ) ||
    await pathExists(
      path.join(projectPath, "bun.lockb")
    )
  ) {
    return "bun";
  }

  return "npm";
}

async function resolveNodeCommand(
  project: Project,
  port: number
): Promise<ResolvedCommand> {
  const manifest =
    await readPackageManifest(project.path);

  const scripts = manifest?.scripts ?? {};

  const scriptName =
    ["dev", "start", "serve"].find(
      (candidate) => candidate in scripts
    );

  if (!scriptName) {
    throw new ProcessManagerError(
      "PROJECT_SCRIPT_NOT_FOUND",
      `Nenhum script dev, start ou serve foi encontrado em ${project.name}.`
    );
  }

  const packageManager =
    await resolveNodePackageManager(project.path);

  return {
    command: packageManager,
    args: [
      "run",
      scriptName
    ],
    env: {
      PORT: String(port),
      HOST: "127.0.0.1"
    }
  };
}

async function resolveRailsCommand(
  project: Project,
  port: number
): Promise<ResolvedCommand> {
  const railsExecutable = path.join(
    project.path,
    "bin",
    "rails"
  );

  if (await pathExists(railsExecutable)) {
    return {
      command: railsExecutable,
      args: [
        "server",
        "--binding",
        "127.0.0.1",
        "--port",
        String(port)
      ],
      env: {}
    };
  }

  return {
    command: "bundle",
    args: [
      "exec",
      "rails",
      "server",
      "--binding",
      "127.0.0.1",
      "--port",
      String(port)
    ],
    env: {}
  };
}

async function resolveServerCommand(
  project: Project,
  port: number
): Promise<ResolvedCommand> {
  switch (project.type) {
    case "rails":
      return await resolveRailsCommand(project, port);

    case "node":
      return await resolveNodeCommand(project, port);

    default:
      throw new ProcessManagerError(
        "PROJECT_SERVER_UNSUPPORTED",
        `O projeto ${project.name} não possui servidor suportado.`
      );
  }
}

function isStoredProcess(
  value: unknown
): value is StoredProcess {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate =
    value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.command === "string" &&
    Array.isArray(candidate.args) &&
    candidate.args.every(
      (argument) => typeof argument === "string"
    ) &&
    typeof candidate.cwd === "string" &&
    typeof candidate.logPath === "string"
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      isErrnoException(error) &&
      error.code === "EPERM"
    ) {
      return true;
    }

    return false;
  }
}

async function verifyProcessDirectory(
  storedProcess: StoredProcess
): Promise<boolean> {
  if (!storedProcess.pid) {
    return false;
  }

  if (process.platform !== "linux") {
    return true;
  }

  try {
    const processDirectory = await realpath(
      `/proc/${storedProcess.pid}/cwd`
    );

    const expectedDirectory = await realpath(
      storedProcess.cwd
    );

    return processDirectory === expectedDirectory;
  } catch {
    return false;
  }
}

async function waitForProcessExit(
  pid: number,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return !isProcessAlive(pid);
}

export class ProcessManager {
  private readonly stateDirectory: string;
  private readonly processDirectory: string;
  private readonly logDirectory: string;

  public constructor(
    stateDirectory = resolveStateDirectory()
  ) {
    this.stateDirectory = stateDirectory;

    this.processDirectory = path.join(
      stateDirectory,
      "processes"
    );

    this.logDirectory = path.join(
      stateDirectory,
      "logs"
    );
  }

  public async getServerProcess(
    projectId: string
  ): Promise<ManagedProcess | null> {
    const storedProcess =
      await this.readStoredProcess(projectId);

    if (!storedProcess) {
      return null;
    }

    if (
      storedProcess.status === "running" ||
      storedProcess.status === "starting"
    ) {
      const running =
        storedProcess.pid !== undefined &&
        isProcessAlive(storedProcess.pid) &&
        await verifyProcessDirectory(storedProcess);

      if (!running) {
        const stoppedProcess: StoredProcess = {
          ...storedProcess,
          status: "stopped",
          stoppedAt: new Date().toISOString()
        };

        await this.writeStoredProcess(stoppedProcess);

        return stoppedProcess;
      }
    }

    return storedProcess;
  }

  public async startServer(
    project: Project,
    options: StartServerOptions = {}
  ): Promise<ManagedProcess> {
    const currentProcess =
      await this.getServerProcess(project.id);

    if (
      currentProcess?.status === "running" ||
      currentProcess?.status === "starting"
    ) {
      throw new ProcessManagerError(
        "PROCESS_ALREADY_RUNNING",
        `O servidor de ${project.name} já está em execução.`
      );
    }

    const port =
      options.port ??
      project.port ??
      await findAvailablePort();

    validatePort(port);

    const resolvedCommand =
      await resolveServerCommand(project, port);

    await Promise.all([
      mkdir(this.processDirectory, {
        recursive: true,
        mode: 0o700
      }),
      mkdir(this.logDirectory, {
        recursive: true,
        mode: 0o700
      })
    ]);

    const logPath = path.join(
      this.logDirectory,
      `${this.createProjectKey(project.id)}.server.log`
    );

    const logHandle = await open(
      logPath,
      "a",
      0o600
    );

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(
        resolvedCommand.command,
        resolvedCommand.args,
        {
          cwd: project.path,
          detached: true,
          shell: false,
          windowsHide: true,
          stdio: [
            "ignore",
            logHandle.fd,
            logHandle.fd
          ],
          env: {
            ...process.env,
            ...resolvedCommand.env
          }
        }
      );

      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
    } finally {
      await logHandle.close();
    }

    if (!child.pid) {
      throw new Error(
        `Não foi possível obter o PID do servidor de ${project.name}.`
      );
    }

    child.unref();

    const managedProcess: StoredProcess = {
      id: `${project.id}:server`,
      projectId: project.id,
      kind: "server",
      status: "running",
      pid: child.pid,
      port,
      command: resolvedCommand.command,
      args: resolvedCommand.args,
      cwd: project.path,
      logPath,
      startedAt: new Date().toISOString()
    };

    await this.writeStoredProcess(managedProcess);

    return managedProcess;
  }

  public async stopServer(
    projectId: string
  ): Promise<ManagedProcess> {
    const storedProcess =
      await this.readStoredProcess(projectId);

    if (
      !storedProcess ||
      storedProcess.pid === undefined
    ) {
      throw new ProcessManagerError(
        "PROCESS_NOT_FOUND",
        "Nenhum processo gerenciado foi encontrado."
      );
    }

    if (!isProcessAlive(storedProcess.pid)) {
      const stoppedProcess: StoredProcess = {
        ...storedProcess,
        status: "stopped",
        stoppedAt: new Date().toISOString()
      };

      await this.writeStoredProcess(stoppedProcess);

      return stoppedProcess;
    }

    const processMatches =
      await verifyProcessDirectory(storedProcess);

    if (!processMatches) {
      throw new ProcessManagerError(
        "PROCESS_IDENTITY_MISMATCH",
        "O PID salvo pertence a outro processo e não será encerrado."
      );
    }

    const stoppingProcess: StoredProcess = {
      ...storedProcess,
      status: "stopping"
    };

    await this.writeStoredProcess(stoppingProcess);

    this.sendSignal(storedProcess.pid, "SIGTERM");

    const exitedGracefully =
      await waitForProcessExit(
        storedProcess.pid,
        5_000
      );

    if (!exitedGracefully) {
      this.sendSignal(storedProcess.pid, "SIGKILL");

      await waitForProcessExit(
        storedProcess.pid,
        2_000
      );
    }

    const stoppedProcess: StoredProcess = {
      ...storedProcess,
      status: "stopped",
      stoppedAt: new Date().toISOString()
    };

    await this.writeStoredProcess(stoppedProcess);

    return stoppedProcess;
  }

  private sendSignal(
    pid: number,
    signal: NodeJS.Signals
  ): void {
    try {
      if (process.platform === "win32") {
        process.kill(pid, signal);
        return;
      }

      process.kill(-pid, signal);
    } catch (error) {
      if (
        isErrnoException(error) &&
        error.code === "ESRCH"
      ) {
        return;
      }

      throw error;
    }
  }

  private createProjectKey(
    projectId: string
  ): string {
    const readable = projectId
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 80);

    const hash = createHash("sha256")
      .update(projectId)
      .digest("hex")
      .slice(0, 8);

    return `${readable}-${hash}`;
  }

  private resolveProcessFile(
    projectId: string
  ): string {
    return path.join(
      this.processDirectory,
      `${this.createProjectKey(projectId)}.server.json`
    );
  }

  private async readStoredProcess(
    projectId: string
  ): Promise<StoredProcess | null> {
    try {
      const contents = await readFile(
        this.resolveProcessFile(projectId),
        "utf8"
      );

      const parsed: unknown = JSON.parse(contents);

      if (!isStoredProcess(parsed)) {
        throw new Error(
          "O arquivo de estado do processo possui formato inválido."
        );
      }

      return parsed;
    } catch (error) {
      if (
        isErrnoException(error) &&
        error.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  private async writeStoredProcess(
    managedProcess: StoredProcess
  ): Promise<void> {
    await mkdir(this.processDirectory, {
      recursive: true,
      mode: 0o700
    });

    const processFile =
      this.resolveProcessFile(
        managedProcess.projectId
      );

    const temporaryFile =
      `${processFile}.${process.pid}.tmp`;

    await writeFile(
      temporaryFile,
      `${JSON.stringify(managedProcess, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600
      }
    );

    await rename(
      temporaryFile,
      processFile
    );
  }
}
