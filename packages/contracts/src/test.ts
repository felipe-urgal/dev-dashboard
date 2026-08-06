import type { ManagedProcess, ProcessLogSnapshot } from './process.js';

export type ProjectTestRunner =
  | 'vitest'
  | 'jest'
  | 'node-test'
  | 'rspec'
  | 'rails-test'
  | 'minitest'
  | 'pytest';

export type ProjectTestOrigin =
  'package-script' | 'binary' | 'gemfile' | 'directory' | 'python-config';

export interface ProjectTestCommand {
  id: string;
  runner: ProjectTestRunner;
  label: string;
  description: string;
  origin: ProjectTestOrigin;
  originDetail?: string;
  priority: number;
  supportsFileTarget: boolean;
  /** Suporta executar um caso/exemplo específico (ex. RSpec `arquivo:linha`). */
  supportsCaseTarget: boolean;
}

export interface ProjectTestOverview {
  supported: boolean;
  commands: ProjectTestCommand[];
}

export interface ProjectTestFile {
  path: string;
}

export interface TestFailureLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface TestFailure {
  id: string;
  runner: ProjectTestRunner;
  name: string;
  message: string;
  location?: TestFailureLocation;
  expected?: string;
  actual?: string;
  stack: string[];
}

export type TestExecutionStatus =
  'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export interface TestExecutionRecord {
  id: string;
  projectId: string;
  commandId: string;
  targetFile?: string;
  status: TestExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
}

export interface TestExecutionHistory {
  items: TestExecutionRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type TestExecutionEvent =
  | { type: 'state'; process: ManagedProcess }
  | { type: 'log'; log: ProcessLogSnapshot };
