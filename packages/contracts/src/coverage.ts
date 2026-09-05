export interface ProjectCoverageMetric {
  total: number;
  covered: number;
  pct: number;
}

export interface ProjectCoverageTotals {
  statements: ProjectCoverageMetric;
  branches: ProjectCoverageMetric;
  functions: ProjectCoverageMetric;
  lines: ProjectCoverageMetric;
}

export interface ProjectCoverageFileSummary extends ProjectCoverageTotals {
  path: string;
}

export interface ProjectCoverageSummary {
  available: boolean;
  generatedAt?: string;
  total?: ProjectCoverageTotals;
  files?: ProjectCoverageFileSummary[];
}

export interface ProjectCoverageHistoryEntry {
  id: string;
  generatedAt: string;
  recordedAt: string;
  total: ProjectCoverageTotals;
  files?: ProjectCoverageFileSummary[];
  gitRevision?: string;
  gitDirtyFingerprint?: string;
  environmentInstanceId?: string;
}

export interface ProjectCoverageHistory {
  items: ProjectCoverageHistoryEntry[];
  total: number;
}
