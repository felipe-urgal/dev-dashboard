import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  ManagedProcess,
  Project,
  ProcessLogSnapshot,
  RailsCredentialsEnvironmentStatus,
  RailsCredentialsOverview,
  RailsWorkerId,
  RailsWorkerOverview,
} from '@dev-dashboard/contracts';
import type {
  ProcessManager,
  ReadServerLogOptions,
  StartWorkerCommand,
  WorkerKind,
} from '@dev-dashboard/process-manager';

import { pathExists } from './rails-inspection/command-resolution.js';

/**
 * Catálogo fechado: cada RailsWorkerId reconhecido mapeia para exatamente um
 * `kind` de processo gerenciado do process-manager. O navegador nunca envia
 * comando ou argumentos — apenas o identificador.
 */
const WORKER_PROCESS_KIND: Record<RailsWorkerId, WorkerKind> = {
  sidekiq: 'worker',
  webpack: 'webpack',
};

export type RailsWorkerErrorCode =
  | 'RAILS_WORKER_UNSUPPORTED'
  | 'RAILS_WORKER_RESTART_UNSUPPORTED';

export class RailsWorkerError extends Error {
  public constructor(
    public readonly code: RailsWorkerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RailsWorkerError';
  }
}

async function gemfileContains(
  projectPath: string,
  needle: string,
): Promise<boolean> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'Gemfile'),
      'utf8',
    );
    return contents.includes(needle);
  } catch {
    return false;
  }
}

async function packageJsonHasDependency(
  projectPath: string,
  name: string,
): Promise<boolean> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );
    const parsed = JSON.parse(contents) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return Boolean(
      parsed.dependencies?.[name] || parsed.devDependencies?.[name],
    );
  } catch {
    return false;
  }
}

async function detectSidekiq(project: Project): Promise<boolean> {
  if (project.type !== 'rails') return false;
  if (await pathExists(path.join(project.path, 'bin', 'sidekiq'))) return true;
  return gemfileContains(project.path, 'sidekiq');
}

async function detectWebpack(project: Project): Promise<boolean> {
  if (project.type !== 'rails') return false;
  if (
    await pathExists(
      path.join(project.path, 'bin', 'webpack-dev-server'),
    )
  ) {
    return true;
  }
  if (await packageJsonHasDependency(project.path, 'webpack-dev-server')) {
    return true;
  }
  return (
    (await gemfileContains(project.path, 'webpacker')) ||
    (await gemfileContains(project.path, 'shakapacker'))
  );
}

async function resolveSidekiqCommand(
  project: Project,
): Promise<StartWorkerCommand> {
  const binPath = path.join(project.path, 'bin', 'sidekiq');
  if (await pathExists(binPath)) {
    return { id: 'sidekiq', command: binPath, args: [] };
  }
  return { id: 'sidekiq', command: 'bundle', args: ['exec', 'sidekiq'] };
}

async function resolveWebpackCommand(
  project: Project,
): Promise<StartWorkerCommand> {
  const binPath = path.join(project.path, 'bin', 'webpack-dev-server');
  if (await pathExists(binPath)) {
    return { id: 'webpack', command: binPath, args: [] };
  }
  if (await pathExists(path.join(project.path, 'yarn.lock'))) {
    return { id: 'webpack', command: 'yarn', args: ['webpack-dev-server'] };
  }
  return { id: 'webpack', command: 'npx', args: ['webpack-dev-server'] };
}

/**
 * Gerencia os workers de fundo reconhecidos para projetos Rails (Sidekiq e
 * webpack-dev-server) por cima do `kind: 'worker' | 'webpack'` do
 * process-manager, além do status somente leitura das credentials
 * criptografadas. Catálogo fechado: o navegador envia apenas `RailsWorkerId`,
 * nunca comando ou argumentos.
 */
export class RailsRuntimeService {
  public constructor(private readonly processManager: ProcessManager) {}

  private detect(workerId: RailsWorkerId, project: Project): Promise<boolean> {
    return workerId === 'sidekiq'
      ? detectSidekiq(project)
      : detectWebpack(project);
  }

  private resolveCommand(
    workerId: RailsWorkerId,
    project: Project,
  ): Promise<StartWorkerCommand> {
    return workerId === 'sidekiq'
      ? resolveSidekiqCommand(project)
      : resolveWebpackCommand(project);
  }

  public async getWorkerOverview(
    project: Project,
    workerId: RailsWorkerId,
  ): Promise<RailsWorkerOverview> {
    const kind = WORKER_PROCESS_KIND[workerId];
    const [detected, managedProcess] = await Promise.all([
      this.detect(workerId, project),
      this.processManager.getWorkerProcess(project.id, kind),
    ]);

    return { id: workerId, detected, process: managedProcess };
  }

  public async startWorker(
    project: Project,
    workerId: RailsWorkerId,
  ): Promise<ManagedProcess> {
    if (!(await this.detect(workerId, project))) {
      throw new RailsWorkerError(
        'RAILS_WORKER_UNSUPPORTED',
        `Não encontramos indícios de ${workerId} neste projeto.`,
      );
    }

    const command = await this.resolveCommand(workerId, project);
    return this.processManager.startWorker(
      project,
      WORKER_PROCESS_KIND[workerId],
      command,
    );
  }

  public stopWorker(
    projectId: string,
    workerId: RailsWorkerId,
  ): Promise<ManagedProcess> {
    return this.processManager.stopWorker(
      projectId,
      WORKER_PROCESS_KIND[workerId],
    );
  }

  public async restartWorker(
    project: Project,
    workerId: RailsWorkerId,
  ): Promise<ManagedProcess> {
    if (workerId !== 'sidekiq') {
      throw new RailsWorkerError(
        'RAILS_WORKER_RESTART_UNSUPPORTED',
        'Reiniciar não é suportado para este worker.',
      );
    }

    const kind = WORKER_PROCESS_KIND[workerId];
    const current = await this.processManager.getWorkerProcess(
      project.id,
      kind,
    );

    if (
      current &&
      (current.status === 'running' ||
        current.status === 'starting' ||
        current.status === 'stopping')
    ) {
      await this.processManager.stopWorker(project.id, kind);
    }

    return this.startWorker(project, workerId);
  }

  public readWorkerLog(
    projectId: string,
    workerId: RailsWorkerId,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    return this.processManager.readWorkerLog(
      projectId,
      WORKER_PROCESS_KIND[workerId],
      options,
    );
  }

  public clearWorkerLog(
    projectId: string,
    workerId: RailsWorkerId,
  ): Promise<ProcessLogSnapshot> {
    return this.processManager.clearWorkerLog(
      projectId,
      WORKER_PROCESS_KIND[workerId],
    );
  }

  /**
   * Somente leitura: relata apenas a existência dos arquivos de credentials
   * e da chave mestra por ambiente. Nunca lê ou expõe o conteúdo
   * criptografado nem o valor da chave.
   */
  public async getCredentialsOverview(
    project: Project,
  ): Promise<RailsCredentialsOverview> {
    if (project.type !== 'rails') {
      return { supported: false, environments: [] };
    }

    const environments: RailsCredentialsEnvironmentStatus[] = [];

    const defaultCredentialsExists = await pathExists(
      path.join(project.path, 'config', 'credentials.yml.enc'),
    );
    const defaultKeyExists = await pathExists(
      path.join(project.path, 'config', 'master.key'),
    );

    environments.push({
      name: 'default',
      credentialsPath: path.posix.join('config', 'credentials.yml.enc'),
      credentialsFileExists: defaultCredentialsExists,
      keyPath: path.posix.join('config', 'master.key'),
      keyFileExists: defaultKeyExists,
      keySource: defaultKeyExists
        ? 'file'
        : process.env.RAILS_MASTER_KEY
          ? 'environment-variable'
          : 'missing',
    });

    if (!defaultCredentialsExists) {
      return { supported: false, environments };
    }

    const credentialsDir = path.join(project.path, 'config', 'credentials');
    let entries: string[] = [];

    try {
      entries = await readdir(credentialsDir);
    } catch {
      entries = [];
    }

    const environmentNames = Array.from(
      new Set(
        entries
          .filter((name) => name.endsWith('.yml.enc'))
          .map((name) => name.replace(/\.yml\.enc$/, '')),
      ),
    ).sort();

    for (const environmentName of environmentNames) {
      const keyExists = await pathExists(
        path.join(credentialsDir, `${environmentName}.key`),
      );

      environments.push({
        name: environmentName,
        credentialsPath: path.posix.join(
          'config',
          'credentials',
          `${environmentName}.yml.enc`,
        ),
        credentialsFileExists: true,
        keyPath: path.posix.join(
          'config',
          'credentials',
          `${environmentName}.key`,
        ),
        keyFileExists: keyExists,
        keySource: keyExists
          ? 'file'
          : process.env.RAILS_MASTER_KEY
            ? 'environment-variable'
            : 'missing',
      });
    }

    return { supported: true, environments };
  }
}
