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
