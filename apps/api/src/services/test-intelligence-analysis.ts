import type {
  ProjectCoverageHistoryEntry,
  ProjectCoverageTotals,
  TestCoverageDeltaAnalysis,
  TestCoverageFileDelta,
  TestCoverageMetricDelta,
  TestFlakinessAnalysis,
  TestFlakinessEvidence,
  TestOutcome,
} from '@dev-dashboard/contracts';

export interface StructuredTestAttempt {
  executionId: string;
  testIdentity?: string;
  outcome?: TestOutcome;
  gitRevision?: string;
  gitDirtyFingerprint?: string;
  environmentInstanceId?: string;
}

function identityKey(value: {
  gitRevision?: string;
  gitDirtyFingerprint?: string;
  environmentInstanceId?: string;
}): string | null {
  if (!value.gitRevision || !value.gitDirtyFingerprint) return null;
  return [
    value.gitRevision,
    value.gitDirtyFingerprint,
    value.environmentInstanceId ?? '',
  ].join('\0');
}

export function haveCompatibleSourceIdentity(
  current: {
    gitRevision?: string;
    gitDirtyFingerprint?: string;
    environmentInstanceId?: string;
  },
  baseline: {
    gitRevision?: string;
    gitDirtyFingerprint?: string;
    environmentInstanceId?: string;
  },
): boolean {
  const currentKey = identityKey(current);
  const baselineKey = identityKey(baseline);
  return currentKey !== null && currentKey === baselineKey;
}

function metricDelta(
  current: ProjectCoverageTotals,
  baseline: ProjectCoverageTotals,
): TestCoverageMetricDelta {
  const delta = (currentPct: number, baselinePct: number) =>
    Number((currentPct - baselinePct).toFixed(2));
  return {
    statements: delta(current.statements.pct, baseline.statements.pct),
    branches: delta(current.branches.pct, baseline.branches.pct),
    functions: delta(current.functions.pct, baseline.functions.pct),
    lines: delta(current.lines.pct, baseline.lines.pct),
  };
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isWorse(delta: TestCoverageMetricDelta): boolean {
  return (
    delta.statements < 0 ||
    delta.branches < 0 ||
    delta.functions < 0 ||
    delta.lines < 0
  );
}

export function buildCoverageDelta(
  items: readonly ProjectCoverageHistoryEntry[],
  currentGeneratedAt: string | undefined,
  changedFiles: readonly string[],
): TestCoverageDeltaAnalysis {
  const unknown = (
    reason: NonNullable<TestCoverageDeltaAnalysis['reason']>,
  ): TestCoverageDeltaAnalysis => ({
    state: 'unknown',
    reason,
    ...(currentGeneratedAt ? { currentGeneratedAt } : {}),
    worsenedFiles: [],
    missingFiles: [],
  });

  if (!currentGeneratedAt) return unknown('no-current-artifact');
  const current = items.find((item) => item.generatedAt === currentGeneratedAt);
  if (!current) return unknown('no-current-artifact');
  if (!identityKey(current)) return unknown('identity-incomplete');

  const baseline = items.find(
    (item) =>
      item.generatedAt !== current.generatedAt &&
      haveCompatibleSourceIdentity(current, item),
  );
  if (!baseline) return unknown('no-compatible-baseline');

  const currentFiles = new Map(
    (current.files ?? []).map((file) => [normalizePath(file.path), file]),
  );
  const baselineFiles = new Map(
    (baseline.files ?? []).map((file) => [normalizePath(file.path), file]),
  );
  const worsenedFiles: TestCoverageFileDelta[] = [];
  const missingFiles: string[] = [];

  for (const rawPath of changedFiles) {
    const filePath = normalizePath(rawPath);
    const currentFile = currentFiles.get(filePath);
    const baselineFile = baselineFiles.get(filePath);
    if (!currentFile || !baselineFile) {
      missingFiles.push(rawPath);
      continue;
    }
    const delta = metricDelta(currentFile, baselineFile);
    if (isWorse(delta)) worsenedFiles.push({ path: rawPath, ...delta });
  }

  return {
    state: 'available',
    currentGeneratedAt: current.generatedAt,
    baselineGeneratedAt: baseline.generatedAt,
    total: metricDelta(current.total, baseline.total),
    worsenedFiles,
    missingFiles,
  };
}

export function analyzeStructuredFlakiness(
  attempts: readonly StructuredTestAttempt[],
): TestFlakinessAnalysis {
  if (attempts.length === 0) {
    return {
      state: 'unknown',
      reason: 'no-granular-results',
      tests: [],
    };
  }

  const complete = attempts.filter(
    (
      attempt,
    ): attempt is StructuredTestAttempt & {
      testIdentity: string;
      outcome: TestOutcome;
      gitRevision: string;
      gitDirtyFingerprint: string;
    } =>
      Boolean(attempt.testIdentity) &&
      Boolean(attempt.outcome) &&
      Boolean(identityKey(attempt)),
  );
  if (complete.length === 0) {
    return {
      state: 'unknown',
      reason: 'identity-incomplete',
      tests: [],
    };
  }

  const groups = new Map<string, typeof complete>();
  for (const attempt of complete) {
    const key = `${attempt.testIdentity}\0${identityKey(attempt)}`;
    const group = groups.get(key) ?? [];
    group.push(attempt);
    groups.set(key, group);
  }

  const comparableGroups = Array.from(groups.values()).filter(
    (group) => group.length >= 2,
  );
  if (comparableGroups.length === 0) {
    return {
      state: 'unknown',
      reason: 'insufficient-compatible-attempts',
      tests: [],
    };
  }

  const tests = comparableGroups.flatMap((group) => {
    const passed = group.filter(
      (attempt) => attempt.outcome === 'passed',
    ).length;
    const failed = group.length - passed;
    if (passed === 0 || failed === 0) return [];
    const evidence: TestFlakinessEvidence[] = group.map((attempt) => ({
      executionId: attempt.executionId,
      testIdentity: attempt.testIdentity,
      outcome: attempt.outcome,
      gitRevision: attempt.gitRevision,
      gitDirtyFingerprint: attempt.gitDirtyFingerprint,
      ...(attempt.environmentInstanceId
        ? { environmentInstanceId: attempt.environmentInstanceId }
        : {}),
    }));
    return [
      {
        testIdentity: group[0]!.testIdentity,
        attempts: group.length,
        passed,
        failed,
        evidence,
      },
    ];
  });

  return { state: 'available', tests };
}
