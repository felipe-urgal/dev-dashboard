export type ProjectTestRunner =
  | 'vitest'
  | 'jest'
  | 'node-test'
  | 'rspec'
  | 'rails-test'
  | 'minitest'
  | 'pytest';

export type ProjectTestOrigin =
  | 'package-script'
  | 'binary'
  | 'gemfile'
  | 'directory'
  | 'python-config';

export interface ProjectTestCommand {
  id: string;
  runner: ProjectTestRunner;
  label: string;
  description: string;
  origin: ProjectTestOrigin;
  originDetail?: string;
  priority: number;
  supportsFileTarget: boolean;
}

export interface ProjectTestOverview {
  supported: boolean;
  commands: ProjectTestCommand[];
}

export interface ProjectTestFile {
  path: string;
}
