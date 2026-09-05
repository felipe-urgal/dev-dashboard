import type { Project } from '@dev-dashboard/contracts';

import type { GitService } from './git-service.js';
import type { ProjectDoctorService } from './project-doctor-service.js';
import {
  buildReleaseReadinessSnapshot,
  evaluateDoctorReadiness,
  evaluateGitReadiness,
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
    doctor: { label: 'Abrir Doctor', target: 'doctor' as const },
  };
  const summaryById = {
    git: 'Estado Git indisponível',
    tests: 'Histórico de testes indisponível',
    doctor: 'Project Doctor indisponível',
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

  public constructor(
    private readonly gitService: Pick<GitService, 'getOverview'>,
    private readonly testHistoryService: Pick<TestExecutionHistoryService, 'history'>,
    private readonly projectDoctorService: Pick<ProjectDoctorService, 'getReport'>,
    options: ReleaseReadinessServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.captureIdentity = options.captureIdentity ?? captureTestExecutionGitIdentity;
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
    const [gitOverview, testHistory, identity, doctorReport] = await Promise.all([
      safely(() => this.gitService.getOverview(project.path)),
      safely(() => this.testHistoryService.history(project.id, 1, 50)),
      safely(() => this.captureIdentity(project.path)),
      safely(() => this.projectDoctorService.getReport(project)),
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
      doctorReport
        ? evaluateDoctorReadiness(doctorReport)
        : unavailableCheck('doctor', observedAt),
    ];

    return buildReleaseReadinessSnapshot(checks, observedAt);
  }
}
