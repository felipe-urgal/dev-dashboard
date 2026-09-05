export interface ProjectEnvironmentVariable {
  name: string;
  value?: string;
  sensitive: boolean;
}

export interface ProjectEnvironmentVariableValue {
  file: string;
  name: string;
  value: string;
  sensitive: boolean;
}

export interface ProjectEnvironmentFile {
  file: string;
  variables: ProjectEnvironmentVariable[];
}

export interface ProjectEnvironmentOverview {
  files: ProjectEnvironmentFile[];
}

export type ProjectEnvironmentContractScope =
  | 'default'
  | 'test'
  | 'production'
  | 'docker';

export type ProjectEnvironmentBaselineStatus =
  | 'resolved'
  | 'ambiguous'
  | 'missing';

export type ProjectEnvironmentContractVariableStatus =
  | 'present'
  | 'missing'
  | 'undocumented'
  | 'duplicate'
  | 'conflicting-source'
  | 'optional'
  | 'unknown';

export type ProjectEnvironmentContractAction =
  | 'none'
  | 'configure'
  | 'document'
  | 'review-source'
  | 'choose-baseline';

export interface ProjectEnvironmentContractVariable {
  name: string;
  sensitive: boolean;
  status: ProjectEnvironmentContractVariableStatus;
  baseline: string | null;
  sources: string[];
  required: boolean | null;
  suggestedAction: ProjectEnvironmentContractAction;
}

export interface ProjectEnvironmentContractSection {
  scope: ProjectEnvironmentContractScope;
  baselineStatus: ProjectEnvironmentBaselineStatus;
  baseline: string | null;
  baselineCandidates: string[];
  sourceFiles: string[];
  variables: ProjectEnvironmentContractVariable[];
}

export interface ProjectEnvironmentContract {
  sections: ProjectEnvironmentContractSection[];
}
