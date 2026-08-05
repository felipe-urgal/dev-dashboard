export type ProjectDiagnosticStatus =
  | 'passed'
  | 'warning'
  | 'failed'
  | 'skipped';

export type ProjectDiagnosticOverallStatus =
  | 'healthy'
  | 'attention'
  | 'blocked';

export type ProjectDiagnosticCategory =
  | 'project'
  | 'runtime'
  | 'dependencies'
  | 'configuration';

export type ProjectDiagnosticActionTarget =
  | 'dependencies'
  | 'server'
  | 'database'
  | 'settings';

export interface ProjectDiagnosticAction {
  label: string;
  target: ProjectDiagnosticActionTarget;
}

export interface ProjectDiagnosticCheck {
  id: string;
  category: ProjectDiagnosticCategory;
  label: string;
  status: ProjectDiagnosticStatus;
  summary: string;
  recommendation?: string;
  action?: ProjectDiagnosticAction;
}

export interface ProjectDiagnosticSummary {
  passed: number;
  warnings: number;
  failed: number;
  skipped: number;
}

export interface ProjectDiagnosticReport {
  projectId: string;
  generatedAt: string;
  overallStatus: ProjectDiagnosticOverallStatus;
  summary: ProjectDiagnosticSummary;
  checks: ProjectDiagnosticCheck[];
}
