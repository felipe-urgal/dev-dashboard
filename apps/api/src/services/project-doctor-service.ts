import { execFile } from 'node:child_process';

import type {
  Project,
  ProjectDiagnosticCheck,
  ProjectDiagnosticReport,
} from '@dev-dashboard/contracts';

import type {
  DoctorCheckDefinition,
  DoctorCommandOptions,
  DoctorCommandResult,
  DoctorCommandRunner,
} from './project-doctor/check-types.js';
import { createDiagnosticCheck } from './project-doctor/check-types.js';
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
}

interface CachedReport {
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

  public constructor(options: ProjectDoctorServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
  }

  public invalidate(projectId?: string): void {
    if (projectId === undefined) {
      this.cache.clear();
      return;
    }

    this.cache.delete(projectId);
  }

  public async getReport(
    project: Project,
    options: { refresh?: boolean } = {},
  ): Promise<ProjectDiagnosticReport> {
    const now = this.now();
    const cached = this.cache.get(project.id);
    if (!options.refresh && cached && cached.expiresAt > now) {
      return cached.report;
    }

    const checks = await Promise.all(
      this.createCheckDefinitions(project).map((definition) =>
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

    this.cache.set(project.id, {
      expiresAt: now + this.cacheTtlMs,
      report,
    });
    return report;
  }

  private createCheckDefinitions(project: Project): DoctorCheckDefinition[] {
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
          run: () => checkNodeRuntime(project),
        },
        {
          id: 'node-package-manager',
          category: 'dependencies',
          label: 'Gerenciador Node',
          run: () => checkNodePackageManager(project, this.commandRunner),
        },
        {
          id: 'node-dependencies',
          category: 'dependencies',
          label: 'Dependências Node',
          run: () => checkNodeDependencies(project),
        },
      );
    }

    if (project.type === 'rails') {
      definitions.push(
        {
          id: 'ruby-runtime',
          category: 'runtime',
          label: 'Runtime Ruby',
          run: () => checkRubyRuntime(project, this.commandRunner),
        },
        {
          id: 'bundler-dependencies',
          category: 'dependencies',
          label: 'Dependências Bundler',
          run: () => checkBundlerDependencies(project, this.commandRunner),
        },
      );
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
        recommendation: 'Execute o diagnóstico novamente. Se o problema persistir, revise as permissões e o ambiente local.',
      });
    }
  }
}
