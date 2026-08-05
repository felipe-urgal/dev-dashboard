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
