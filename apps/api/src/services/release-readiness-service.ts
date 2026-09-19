import type {
  GitOpenPullRequest,
  GitPullRequestLookup,
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
}

export interface ReleaseReadinessSnapshotOptions {
  testMaxAgeMs: number;
}

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
  };
  const summaryById = {
    git: 'Estado Git indisponível',
    tests: 'Histórico de testes indisponível',
    'pull-request': 'Estado remoto da Pull Request indisponível',
    doctor: 'Project Doctor indisponível',
    migrations: 'Estado de migrations indisponível',
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

export class ReleaseReadinessService {
  private readonly now: () => number;
  private readonly captureIdentity: (
    projectPath: string | undefined,
  ) => Promise<TestExecutionGitIdentity>;
  private readonly pullRequestLookup:
    ReleaseReadinessServiceOptions['pullRequestLookup'] | undefined;
  private readonly pullRequestStatus:
    ReleaseReadinessServiceOptions['pullRequestStatus'] | undefined;

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
  }

  public async getSnapshot(
    project: Project,
    options: ReleaseReadinessSnapshotOptions,
  ): Promise<ReleaseReadinessSnapshot> {
    if (!Number.isFinite(options.testMaxAgeMs) || options.testMaxAgeMs <= 0) {
      throw new Error('A janela de freshness dos testes deve ser positiva.');
    }

    const now = this.now();
    const observedAt = new Date(now).toISOString();
    const [
      gitOverview,
      testHistory,
      identity,
      doctorReport,
      migrationOverview,
      pullRequestLookup,
    ] = await Promise.all([
      safely(() => this.gitService.getOverview(project.path)),
      safely(() => this.testHistoryService.history(project.id, 1, 50)),
      safely(() => this.captureIdentity(project.path)),
      safely(() => this.projectDoctorService.getReport(project)),
      safely(() => this.migrationOverviewService.inspect(project)),
      this.readPullRequest(project.path),
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
    ];

    return buildReleaseReadinessSnapshot(checks, observedAt);
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
