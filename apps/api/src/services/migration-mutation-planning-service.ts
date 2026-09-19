import { createHash } from 'node:crypto';
import path from 'node:path';

import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { MigrationOverviewService } from './migration-overview-service.js';
import type {
  MigrationMutationCommand,
  MigrationMutationPlan,
  MigrationMutationPreflight,
  MigrationMutationProvider,
} from './migration-mutation-provider.js';

const SAFE_DATABASE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_PROGRAM_LENGTH = 512;
const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 1024;
const FORBIDDEN_PROGRAMS = new Set([
  'bash',
  'cmd',
  'cmd.exe',
  'fish',
  'powershell',
  'powershell.exe',
  'pwsh',
  'sh',
  'zsh',
]);

export type MigrationMutationPlanningErrorCode =
  'MIGRATION_MUTATION_ENVIRONMENT_NOT_FOUND';

export class MigrationMutationPlanningError extends Error {
  public constructor(
    public readonly code: MigrationMutationPlanningErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationMutationPlanningError';
  }
}

export interface MigrationMutationPlanInput {
  operation: 'apply';
  database?: string;
  environmentInstanceId?: string;
}

export interface MigrationMutationPlanningServiceOptions {
  now?: () => Date;
}

type EnvironmentInstanceResolver = Pick<
  DevelopmentEnvironmentInstanceStore,
  'resolveForProject'
>;

type OverviewReader = Pick<MigrationOverviewService, 'inspect'>;

function databaseIdentity(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && SAFE_DATABASE_ID.test(normalized)
    ? normalized
    : 'primary';
}

function scopedProject(
  project: Project,
  executionContext: ExecutionContext,
): Project {
  return { ...project, path: executionContext.cwd };
}

function unavailablePreflight(
  reason: MigrationMutationPreflight['reason'],
  observedAt: string,
  evidence: string,
  diagnostic: string,
): MigrationMutationPreflight {
  return {
    state: 'unavailable',
    reason,
    observedAt,
    evidence,
    diagnostic,
  };
}

function blockedPreflight(
  reason: MigrationMutationPreflight['reason'],
  observedAt: string,
  evidence: string,
  diagnostic: string,
): MigrationMutationPreflight {
  return {
    state: 'blocked',
    reason,
    observedAt,
    evidence,
    diagnostic,
  };
}

function readyPreflight(
  observedAt: string,
  evidence: string,
): MigrationMutationPreflight {
  return {
    state: 'ready',
    reason: 'ready',
    observedAt,
    evidence,
  };
}

function normalizedCommand(
  command: MigrationMutationCommand,
): MigrationMutationCommand | undefined {
  const file = command.file.trim();
  if (
    !file ||
    file.length > MAX_PROGRAM_LENGTH ||
    file.includes('\0') ||
    file.includes('\n') ||
    file.includes('\r') ||
    FORBIDDEN_PROGRAMS.has(path.basename(file).toLowerCase())
  ) {
    return undefined;
  }
  if (command.args.length > MAX_ARGS) return undefined;

  const args: string[] = [];
  for (const argument of command.args) {
    if (
      argument.length > MAX_ARG_LENGTH ||
      argument.includes('\0') ||
      argument.includes('\n') ||
      argument.includes('\r')
    ) {
      return undefined;
    }
    args.push(argument);
  }
  return { file, args };
}

function planHash(
  input: Omit<MigrationMutationPlan, 'planHash'>,
): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function buildPlan(
  input: Omit<MigrationMutationPlan, 'planHash'>,
): MigrationMutationPlan {
  return { ...input, planHash: planHash(input) };
}

export class MigrationMutationPlanningService {
  private readonly now: () => Date;

  public constructor(
    private readonly providers: readonly MigrationMutationProvider[],
    private readonly overviewService: OverviewReader,
    private readonly environmentInstanceStore: EnvironmentInstanceResolver,
    options: MigrationMutationPlanningServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async plan(
    project: Project,
    input: MigrationMutationPlanInput,
  ): Promise<MigrationMutationPlan> {
    const executionContext =
      this.environmentInstanceStore.resolveForProject(
        project.id,
        input.environmentInstanceId,
      );
    if (!executionContext) {
      throw new MigrationMutationPlanningError(
        'MIGRATION_MUTATION_ENVIRONMENT_NOT_FOUND',
        'Ambiente de desenvolvimento não encontrado ou indisponível para este projeto.',
      );
    }

    const createdAt = this.now().toISOString();
    const requestedDatabase = databaseIdentity(input.database);

    if (executionContext.runtime !== 'host') {
      return buildPlan({
        projectId: project.id,
        provider: 'none',
        operation: input.operation,
        database: requestedDatabase,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        preflight: blockedPreflight(
          'runtime-unsupported',
          createdAt,
          'Development Environment Instance',
          'O primeiro contrato comum de migration mutation suporta apenas runtime host; devcontainer permanece bloqueado até existir adapter próprio.',
        ),
      });
    }

    const selectedProject = scopedProject(project, executionContext);
    let provider: MigrationMutationProvider | undefined;
    for (const candidate of this.providers) {
      try {
        if (candidate.supports(selectedProject)) {
          provider = candidate;
          break;
        }
      } catch {
        // Provider confiável não pode derrubar a superfície comum ao avaliar supports.
      }
    }

    if (!provider) {
      return buildPlan({
        projectId: project.id,
        provider: 'none',
        operation: input.operation,
        database: requestedDatabase,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        preflight: unavailablePreflight(
          'provider-unavailable',
          createdAt,
          'Migration mutation provider',
          'Nenhum provider comum de mutation foi habilitado para este projeto.',
        ),
      });
    }

    let overview;
    try {
      overview = await this.overviewService.inspect(
        selectedProject,
        requestedDatabase,
      );
    } catch {
      return buildPlan({
        projectId: project.id,
        provider: provider.id,
        operation: input.operation,
        database: requestedDatabase,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        preflight: unavailablePreflight(
          'inspection-inconclusive',
          createdAt,
          'MigrationOverview',
          'A inspeção read-only falhou; mutation permanece indisponível.',
        ),
      });
    }
    const database = databaseIdentity(overview.database);

    if (overview.provider !== provider.id) {
      return buildPlan({
        projectId: project.id,
        provider: provider.id,
        operation: input.operation,
        database,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        overviewObservedAt: overview.observedAt,
        preflight: unavailablePreflight(
          'provider-evidence-mismatch',
          overview.observedAt,
          overview.evidence,
          'A inspeção read-only e o provider de mutation não apontam para o mesmo provider; a operação não pode ser planejada com segurança.',
        ),
      });
    }

    if (overview.status === 'up-to-date') {
      return buildPlan({
        projectId: project.id,
        provider: provider.id,
        operation: input.operation,
        database,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        overviewObservedAt: overview.observedAt,
        preflight: blockedPreflight(
          'nothing-pending',
          overview.observedAt,
          overview.evidence,
          'A inspeção comprovou que não há migrations pendentes para aplicar.',
        ),
      });
    }

    if (overview.status !== 'pending') {
      return buildPlan({
        projectId: project.id,
        provider: provider.id,
        operation: input.operation,
        database,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        overviewObservedAt: overview.observedAt,
        preflight: unavailablePreflight(
          'inspection-inconclusive',
          overview.observedAt,
          overview.evidence,
          'A inspeção não comprovou migrations pendentes; mutation permanece indisponível.',
        ),
      });
    }

    let providerPlan;
    try {
      providerPlan = await provider.planMutation({
        project: selectedProject,
        executionContext,
        operation: input.operation,
        database,
        overview,
        now: this.now,
      });
    } catch {
      return buildPlan({
        projectId: project.id,
        provider: provider.id,
        operation: input.operation,
        database,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        overviewObservedAt: overview.observedAt,
        preflight: unavailablePreflight(
          'provider-plan-invalid',
          overview.observedAt,
          overview.evidence,
          'O provider não conseguiu produzir um plano de execução estruturado.',
        ),
      });
    }

    const command = normalizedCommand(providerPlan.command);
    if (!command) {
      return buildPlan({
        projectId: project.id,
        provider: provider.id,
        operation: input.operation,
        database,
        environmentInstanceId: executionContext.environmentInstanceId,
        runtime: executionContext.runtime,
        createdAt,
        overviewObservedAt: overview.observedAt,
        preflight: unavailablePreflight(
          'provider-plan-invalid',
          overview.observedAt,
          overview.evidence,
          'O provider produziu um comando de mutation fora do contrato estruturado.',
        ),
      });
    }

    return buildPlan({
      projectId: project.id,
      provider: provider.id,
      operation: input.operation,
      database,
      environmentInstanceId: executionContext.environmentInstanceId,
      runtime: executionContext.runtime,
      createdAt,
      overviewObservedAt: overview.observedAt,
      preflight: readyPreflight(overview.observedAt, overview.evidence),
      command,
    });
  }
}
