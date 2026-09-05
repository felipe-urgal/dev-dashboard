export type TestIntelligenceState = 'direct' | 'impacted' | 'unknown';
export type TestIntelligenceRecommendation = 'targeted' | 'full-suite';

export interface TestIntelligenceEvidence {
  kind: 'direct-file-match';
  changedFile: string;
  testFiles: string[];
}

export interface TestCoverageMetricDelta {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface TestCoverageFileDelta extends TestCoverageMetricDelta {
  path: string;
}

export type TestCoverageDeltaUnknownReason =
  | 'no-current-artifact'
  | 'identity-incomplete'
  | 'no-compatible-baseline';

export interface TestCoverageDeltaAnalysis {
  state: 'available' | 'unknown';
  reason?: TestCoverageDeltaUnknownReason;
  currentGeneratedAt?: string;
  baselineGeneratedAt?: string;
  total?: TestCoverageMetricDelta;
  worsenedFiles: TestCoverageFileDelta[];
  missingFiles: string[];
}

export type TestOutcome = 'passed' | 'failed';

export interface TestFlakinessEvidence {
  executionId: string;
  testIdentity: string;
  outcome: TestOutcome;
  gitRevision: string;
  gitDirtyFingerprint: string;
  environmentInstanceId?: string;
}

export interface TestFlakyTest {
  testIdentity: string;
  attempts: number;
  passed: number;
  failed: number;
  evidence: TestFlakinessEvidence[];
}

export type TestFlakinessUnknownReason =
  | 'no-granular-results'
  | 'identity-incomplete'
  | 'insufficient-compatible-attempts';

export interface TestFlakinessAnalysis {
  state: 'available' | 'unknown';
  reason?: TestFlakinessUnknownReason;
  tests: TestFlakyTest[];
}

export interface TestIntelligenceSuggestion {
  commandId: string;
  state: TestIntelligenceState;
  recommendation: TestIntelligenceRecommendation;
  baseBranch: string;
  currentBranch: string;
  changedFiles: string[];
  testFiles: string[];
  unmappedFiles: string[];
  evidence: TestIntelligenceEvidence[];
  coverageDelta?: TestCoverageDeltaAnalysis;
  flakiness?: TestFlakinessAnalysis;
}
