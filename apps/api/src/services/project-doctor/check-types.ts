import type {
  Project,
  ProjectDiagnosticAction,
  ProjectDiagnosticCategory,
  ProjectDiagnosticCheck,
  ProjectDiagnosticStatus,
} from '@dev-dashboard/contracts';

export interface DoctorCommandResult {
  stdout: string;
  stderr: string;
}

export interface DoctorCommandOptions {
  cwd?: string;
}

export type DoctorCommandRunner = (
  command: string,
  args: readonly string[],
  options?: DoctorCommandOptions,
) => Promise<DoctorCommandResult>;

export interface DoctorCheckContext {
  project: Project;
  commandRunner: DoctorCommandRunner;
}

export interface DoctorCheckDefinition {
  id: string;
  category: ProjectDiagnosticCategory;
  label: string;
  run: () => Promise<ProjectDiagnosticCheck>;
}

export function createDiagnosticCheck(options: {
  id: string;
  category: ProjectDiagnosticCategory;
  label: string;
  status: ProjectDiagnosticStatus;
  summary: string;
  recommendation?: string;
  action?: ProjectDiagnosticAction;
}): ProjectDiagnosticCheck {
  return {
    id: options.id,
    category: options.category,
    label: options.label,
    status: options.status,
    summary: options.summary,
    ...(options.recommendation
      ? { recommendation: options.recommendation }
      : {}),
    ...(options.action ? { action: options.action } : {}),
  };
}
