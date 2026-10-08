import { execFile } from 'node:child_process';

import type {
  ExecutionContext,
  Project,
  ProjectDiagnosticCheck,
  ProjectDiagnosticReport,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import {
  buildDevContainerWorkspaceCommand,
  isValidDevContainerRuntimeId,
} from './dev-container-exec-adapter.js';
import type {
  DoctorCheckDefinition,
  DoctorCommandOptions,
  DoctorCommandResult,
  DoctorCommandRunner,
} from './project-doctor/check-types.js';
import { createDiagnosticCheck } from './project-doctor/check-types.js';
import {
  checkContainerToolchain,
  projectRequiresContainerToolchain,
} from './project-doctor/container-checks.js';
import {
  checkNodeDependencies,
  checkNodePackageManager,
  checkNodeRuntime,
} from './project-doctor/node-checks.js';
import {
  checkEnvironmentVariables,
  checkExpectedManifest,
  checkProjectDirectory,
} from './project-doctor/project-checks.js';
import {
  checkBundlerDependencies,
  checkRubyRuntime,
} from './project-doctor/rails-checks.js';

const DEFAULT_CACHE_TTL_MS = 15_000;
const COMMAND_TIMEOUT_MS = 2_500;
const COMMAND_MAX_BUFFER_BYTES = 64 * 1024;

interface ProjectDoctorServiceOptions {
  now?: () => number;
  cacheTtlMs?: number;
  commandRunner?: DoctorCommandRunner;
  environmentInstanceStore?: Pick<DevelopmentEnvironmentInstanceStore, 'resolveForProject' | 'findForProject'>;
}

interface CachedReport {
  projectId: string;
  expiresAt: number;
  report: ProjectDiagnosticReport;
}

function defaultCommandRunner(
  command: string,
  args: readonly string[],
  options: DoctorCommandOptions = {},
): Promise<DoctorCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        encoding: 'utf8',
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER_BYTES,
        windowsHide: true,
        ...(options.cwd ? { cwd: options.cwd } : {}),
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

export class ProjectDoctorService {
  private readonly cache = new Map<string, CachedReport>();
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly commandRunner: DoctorCommandRunner;
  private readonly environmentInstanceStore?: ProjectDoctorServiceOptions['environmentInstanceStore'];

  public constructor(options: ProjectDoctorServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.environmentInstanceStore = options.environmentInstanceStore;
  }

  public invalidate(projectId?: string): void {
    if (projectId === undefined) {
      this.cache.clear();
      return;
    }

    for (const [key, entry] of this.cache) {
      if (entry.projectId === projectId) this.cache.delete(key);
    }
  }

  public async getReport(
    project: Project,
    options: {
      refresh?: boolean;
      executionContext?: ExecutionContext;
      contextRevision?: string;
    } = {},
  ): Promise<ProjectDiagnosticReport> {
    const context = options.executionContext ??
      this.environmentInstanceStore?.resolveForProject(project.id) ??
      (this.environmentInstanceStore ? null : {
        projectId: project.id,
        environmentInstanceId: `environment:primary:${project.id}`,
        cwd: project.path,
        runtime: 'host' as const,
      });
    if (!context || context.projectId !== project.id) {
      throw new Error('Environment Instance indisponível para o Project Doctor.');
    }
    const scopedProject = { ...project, path: context.cwd };
    const instance = this.environmentInstanceStore?.findForProject(project.id, context.environmentInstanceId);
    const cacheKey = JSON.stringify({
      projectId: project.id,
      type: project.type,
      capabilities: project.capabilities,
      profile: project.profile,
      sourcePath: project.path,
      environmentInstanceId: context.environmentInstanceId,
      cwd: context.cwd,
      runtime: context.runtime,
      runtimeId: context.runtimeId ?? null,
      lifecycle: options.contextRevision ?? instance?.lifecycle ?? null,
    });
    const now = this.now();
    const cached = this.cache.get(cacheKey);
    if (!options.refresh && cached && cached.expiresAt > now) {
      return cached.report;
    }

    const checks = await Promise.all(
      this.createCheckDefinitions(scopedProject, context).map((definition) =>
        this.runCheckSafely(definition),
      ),
    );
    const summary = {
      passed: checks.filter((check) => check.status === 'passed').length,
      warnings: checks.filter((check) => check.status === 'warning').length,
      failed: checks.filter((check) => check.status === 'failed').length,
      skipped: checks.filter((check) => check.status === 'skipped').length,
    };
    const report: ProjectDiagnosticReport = {
      projectId: project.id,
      generatedAt: new Date(now).toISOString(),
      overallStatus:
        summary.failed > 0
          ? 'blocked'
          : summary.warnings > 0
            ? 'attention'
            : 'healthy',
      summary,
      checks,
    };

    this.cache.set(cacheKey, {
      projectId: project.id,
      expiresAt: now + this.cacheTtlMs,
      report,
    });
    return report;
  }

  private createCheckDefinitions(project: Project, context: ExecutionContext): DoctorCheckDefinition[] {
    const isHost = context.runtime === 'host';
    const containerReady = context.runtime === 'devcontainer' &&
      isValidDevContainerRuntimeId(context.runtimeId);
    const runtimeSupported = isHost || containerReady;
    const skipped = (id: string, category: ProjectDiagnosticCheck['category'], label: string, reason: string) =>
      createDiagnosticCheck({ id, category, label, status: 'skipped', summary: reason });
    const unsupported = 'O runtime selecionado não possui identidade executável válida; a toolchain do host não foi consultada.';
    const commandRunner: DoctorCommandRunner = isHost
      ? this.commandRunner
      : async (command, args, options) => {
          if (!containerReady || !['node', 'npm', 'pnpm', 'yarn', 'bun', 'ruby', 'bundle'].includes(command)) {
            throw new Error('Comando não suportado no Doctor para o runtime selecionado.');
          }
          const built = buildDevContainerWorkspaceCommand({
            runtimeId: context.runtimeId!,
            workspaceFolder: context.cwd,
            command,
            args,
          });
          return this.commandRunner(built.file, built.args, { cwd: options?.cwd ?? context.cwd });
        };
    const definitions: DoctorCheckDefinition[] = [
      {
        id: 'project-directory',
        category: 'project',
        label: 'Diretório do projeto',
        run: () => checkProjectDirectory(project),
      },
      {
        id: 'project-manifest',
        category: 'project',
        label: 'Estrutura esperada',
        run: () => checkExpectedManifest(project),
      },
      {
        id: 'environment-variables',
        category: 'configuration',
        label: 'Variáveis de ambiente',
        run: () => checkEnvironmentVariables(project),
      },
    ];

    if (project.type === 'node' || project.type === 'rails') {
      definitions.push(
        {
          id: 'node-runtime',
          category: 'runtime',
          label: 'Runtime Node',
          run: () => !runtimeSupported
            ? Promise.resolve(skipped('node-runtime', 'runtime', 'Runtime Node', unsupported))
            : isHost
              ? checkNodeRuntime(project)
              : commandRunner('node', ['--version']).then(
                  ({ stdout }) => checkNodeRuntime(project, stdout.trim()),
                  () => Promise.resolve(createDiagnosticCheck({
                    id: 'node-runtime', category: 'runtime', label: 'Runtime Node',
                    status: 'warning', summary: 'Node não está disponível no Dev Container selecionado.',
                  })),
                ),
        },
        {
          id: 'node-package-manager',
          category: 'dependencies',
          label: 'Gerenciador Node',
          run: () => runtimeSupported
            ? checkNodePackageManager(project, commandRunner)
            : Promise.resolve(skipped('node-package-manager', 'dependencies', 'Gerenciador Node', unsupported)),
        },
        {
          id: 'node-dependencies',
          category: 'dependencies',
          label: 'Dependências Node',
          run: () => isHost
            ? checkNodeDependencies(project)
            : Promise.resolve(skipped('node-dependencies', 'dependencies', 'Dependências Node',
                containerReady ? 'Dependências instaladas dentro do Dev Container não são verificadas pelo filesystem do host.' : unsupported)),
        },
      );
    }

    if (project.type === 'rails') {
      definitions.push(
        {
          id: 'ruby-runtime',
          category: 'runtime',
          label: 'Runtime Ruby',
          run: () => runtimeSupported
            ? checkRubyRuntime(project, commandRunner)
            : Promise.resolve(skipped('ruby-runtime', 'runtime', 'Runtime Ruby', unsupported)),
        },
        {
          id: 'bundler-dependencies',
          category: 'dependencies',
          label: 'Dependências Bundler',
          run: () => runtimeSupported
            ? checkBundlerDependencies(project, commandRunner)
            : Promise.resolve(skipped('bundler-dependencies', 'dependencies', 'Dependências Bundler', unsupported)),
        },
      );
    }

    if (projectRequiresContainerToolchain(project)) {
      definitions.push({
        id: 'container-toolchain',
        category: 'runtime',
        label: 'Docker / Compose',
        run: () => isHost
          ? checkContainerToolchain(project, commandRunner)
          : Promise.resolve(skipped('container-toolchain', 'runtime', 'Docker / Compose',
              'Docker / Compose é uma integração do host e não é avaliada como ferramenta interna do Dev Container.')),
      });
    }

    return definitions;
  }

  private async runCheckSafely(
    definition: DoctorCheckDefinition,
  ): Promise<ProjectDiagnosticCheck> {
    try {
      return await definition.run();
    } catch {
      return createDiagnosticCheck({
        id: definition.id,
        category: definition.category,
        label: definition.label,
        status: 'warning',
        summary: 'Não foi possível concluir esta verificação.',
        recommendation:
          'Execute o diagnóstico novamente. Se o problema persistir, revise as permissões e o ambiente local.',
      });
    }
  }
}
