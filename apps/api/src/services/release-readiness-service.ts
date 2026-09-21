import type {
  GitOpenPullRequest,
  GitPullRequestLookup,
  ProductionOverview,
  Project,
} from '@dev-dashboard/contracts';

import type { GitService } from './git-service.js';
import type { MigrationOverviewService } from './migration-overview-service.js';
import type { ProjectDoctorService } from './project-doctor-service.js';
import {
  buildReleaseReadinessSnapshot,
  evaluateDoctorReadiness,
  evaluateGitReadiness,
  evaluateMigrationsReadiness,
  evaluatePullRequestReadiness,
  evaluateProductionReadiness,
  evaluateSecurityReadiness,
  evaluateTestsReadiness,
  type ReleaseReadinessCheck,
  type ReleaseReadinessCheckId,
  type ReleaseReadinessSnapshot,
  type ReleaseReadinessTestIdentity,
} from './release-readiness.js';
import {
  captureTestExecutionGitIdentity,
  type TestExecutionGitIdentity,
} from './test-execution-identity.js';
import type {
  SecurityScanSnapshot,
  SecurityScanSnapshotStore,
} from './security-scan-snapshot-store.js';
import type { TestExecutionHistoryService } from './test-execution-history-service.js';

interface ReleaseReadinessServiceOptions {
  now?: () => number;
  captureIdentity?: (
    projectPath: string | undefined,
  ) => Promise<TestExecutionGitIdentity>;
  pullRequestLookup?: {
    findOpenPullRequest(projectPath: string): Promise<GitPullRequestLookup>;
  };
  pullRequestStatus?: {
    enrich(
      projectPath: string,
      pullRequest: GitOpenPullRequest,
    ): Promise<GitOpenPullRequest>;
  };
  productionOverview?: {
    read(projects: readonly Project[]): Promise<ProductionOverview>;
  };
  securityScanSnapshotReader?: Pick<SecurityScanSnapshotStore, 'get'>;
}

export interface ReleaseReadinessSnapshotOptions {
  testMaxAgeMs: number;
  productionHealthMaxAgeMs?: number;
}

const DEFAULT_PRODUCTION_HEALTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function unavailableCheck(
  id: ReleaseReadinessCheckId,
  observedAt: string,
): ReleaseReadinessCheck {
  const actionById = {
    git: { label: 'Abrir Sincronização', target: 'synchronization' as const },
    tests: { label: 'Abrir Testes', target: 'tests' as const },
    'pull-request': {
      label: 'Abrir Pull Request',
      target: 'pull-request' as const,
    },
    doctor: { label: 'Abrir Doctor', target: 'doctor' as const },
    migrations: { label: 'Abrir Migrations', target: 'migrations' as const },
    security: { label: 'Abrir Segurança', target: 'security' as const },
    production: { label: 'Abrir Produção', target: 'production' as const },
  };
  const summaryById = {
    git: 'Estado Git indisponível',
    tests: 'Histórico de testes indisponível',
    'pull-request': 'Estado remoto da Pull Request indisponível',
    doctor: 'Project Doctor indisponível',
    migrations: 'Estado de migrations indisponível',
    security: 'Estado do Security Center indisponível',
    production: 'Estado de produção indisponível',
  };

  return {
    id,
    state: 'unknown',
    summary: summaryById[id],
    evidence: 'A fonte não pôde ser consultada nesta atualização.',
    observedAt,
    action: actionById[id],
  };
}

function comparableIdentity(
  identity: TestExecutionGitIdentity,
): ReleaseReadinessTestIdentity | undefined {
  if (!identity.gitRevision || !identity.gitDirtyFingerprint) return undefined;
  return {
    gitRevision: identity.gitRevision,
    gitDirtyFingerprint: identity.gitDirtyFingerprint,
  };
}

async function safely<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    return undefined;
  }
}

type SecuritySnapshotObservation =
  | { state: 'available'; snapshot: SecurityScanSnapshot }
  | { state: 'missing' }
  | { state: 'unavailable' };

export class ReleaseReadinessService {
  private readonly now: () => number;
  private readonly captureIdentity: (
    projectPath: string | undefined,
  ) => Promise<TestExecutionGitIdentity>;
  private readonly pullRequestLookup:
    ReleaseReadinessServiceOptions['pullRequestLookup'] | undefined;
  private readonly pullRequestStatus:
    ReleaseReadinessServiceOptions['pullRequestStatus'] | undefined;
  private readonly productionOverview:
    ReleaseReadinessServiceOptions['productionOverview'] | undefined;
  private readonly securityScanSnapshotReader:
    ReleaseReadinessServiceOptions['securityScanSnapshotReader'] | undefined;

  public constructor(
    private readonly gitService: Pick<GitService, 'getOverview'>,
    private readonly testHistoryService: Pick<
      TestExecutionHistoryService,
      'history'
    >,
    private readonly projectDoctorService: Pick<
      ProjectDoctorService,
      'getReport'
    >,
    private readonly migrationOverviewService: Pick<
      MigrationOverviewService,
      'inspect'
    >,
    options: ReleaseReadinessServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.captureIdentity =
      options.captureIdentity ?? captureTestExecutionGitIdentity;
    this.pullRequestLookup = options.pullRequestLookup;
    this.pullRequestStatus = options.pullRequestStatus;
    this.productionOverview = options.productionOverview;
    this.securityScanSnapshotReader = options.securityScanSnapshotReader;
  }

  public async getSnapshot(
    project: Project,
    options: ReleaseReadinessSnapshotOptions,
  ): Promise<ReleaseReadinessSnapshot> {
    if (!Number.isFinite(options.testMaxAgeMs) || options.testMaxAgeMs <= 0) {
      throw new Error('A janela de freshness dos testes deve ser positiva.');
    }

    const now = this.now();
    const productionHealthMaxAgeMs =
      options.productionHealthMaxAgeMs ?? DEFAULT_PRODUCTION_HEALTH_MAX_AGE_MS;
    if (
      !Number.isFinite(productionHealthMaxAgeMs) ||
      productionHealthMaxAgeMs <= 0
    ) {
      throw new Error(
        'A janela de freshness do health de produção deve ser positiva.',
      );
    }
    const observedAt = new Date(now).toISOString();
    const [
      gitOverview,
      testHistory,
      identity,
      doctorReport,
      migrationOverview,
      securityObservation,
      pullRequestLookup,
      productionOverview,
    ] = await Promise.all([
      safely(() => this.gitService.getOverview(project.path)),
      safely(() => this.testHistoryService.history(project.id, 1, 50)),
      safely(() => this.captureIdentity(project.path)),
      safely(() => this.projectDoctorService.getReport(project)),
      safely(() => this.migrationOverviewService.inspect(project)),
      this.readSecurity(project),
      this.readPullRequest(project.path),
      this.readProduction(project),
    ]);

    const checks: ReleaseReadinessCheck[] = [
      gitOverview
        ? evaluateGitReadiness(gitOverview, observedAt)
        : unavailableCheck('git', observedAt),
      testHistory
        ? evaluateTestsReadiness(
            testHistory,
            now,
            options.testMaxAgeMs,
            identity ? comparableIdentity(identity) : undefined,
          )
        : unavailableCheck('tests', observedAt),
      ...(this.pullRequestLookup
        ? [
            gitOverview
              ? evaluatePullRequestReadiness(
                  gitOverview,
                  pullRequestLookup,
                  observedAt,
                )
              : unavailableCheck('pull-request', observedAt),
          ]
        : []),
      doctorReport
        ? evaluateDoctorReadiness(doctorReport)
        : unavailableCheck('doctor', observedAt),
      migrationOverview
        ? evaluateMigrationsReadiness(migrationOverview)
        : unavailableCheck('migrations', observedAt),
      ...(this.securityScanSnapshotReader
        ? [
            securityObservation?.state === 'unavailable'
              ? unavailableCheck('security', observedAt)
              : evaluateSecurityReadiness(
                  securityObservation?.state === 'available'
                    ? securityObservation.snapshot
                    : undefined,
                  observedAt,
                ),
          ]
        : []),
      ...(this.productionOverview && this.isProductionApplicable(project)
        ? [
            productionOverview?.items[0]
              ? evaluateProductionReadiness(
                  productionOverview.items[0],
                  now,
                  productionHealthMaxAgeMs,
                )
              : unavailableCheck('production', observedAt),
          ]
        : []),
    ];

    return buildReleaseReadinessSnapshot(checks, observedAt);
  }

  private async readSecurity(
    project: Project,
  ): Promise<SecuritySnapshotObservation | undefined> {
    if (!this.securityScanSnapshotReader) return undefined;
    try {
      const snapshot = await this.securityScanSnapshotReader.get(project);
      return snapshot ? { state: 'available', snapshot } : { state: 'missing' };
    } catch {
      return { state: 'unavailable' };
    }
  }

  private isProductionApplicable(project: Project): boolean {
    return (
      project.capabilities.includes('production') &&
      project.production !== undefined
    );
  }

  private async readProduction(
    project: Project,
  ): Promise<ProductionOverview | undefined> {
    if (!this.productionOverview || !this.isProductionApplicable(project)) {
      return undefined;
    }
    return safely(() => this.productionOverview!.read([project]));
  }

  private async readPullRequest(
    projectPath: string,
  ): Promise<GitPullRequestLookup | undefined> {
    if (!this.pullRequestLookup) return undefined;

    const lookup = await safely(() =>
      this.pullRequestLookup!.findOpenPullRequest(projectPath),
    );
    if (!lookup?.existing || !this.pullRequestStatus) return lookup;

    const existing = lookup.existing;
    const enriched = await safely(() =>
      this.pullRequestStatus!.enrich(projectPath, existing),
    );
    return enriched ? { ...lookup, existing: enriched } : lookup;
  }
}
