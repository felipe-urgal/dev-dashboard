export type ProjectScriptOrigin =
  'package-script' | 'package-manager' | 'bundler' | 'rails-task' | 'bin';
export type ProjectScriptRisk = 'read-only' | 'mutable' | 'destructive';

export interface ProjectScriptVariable {
  name: string;
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
}

export type ScriptExecutionVariables = Record<string, string>;

export interface ProjectScript {
  id: string;
  name: string;
  description: string;
  command: string;
  origin: ProjectScriptOrigin;
  risk: ProjectScriptRisk;
  enabled: boolean;
  variables?: ProjectScriptVariable[];
}

export interface ProjectScriptCatalog {
  items: ProjectScript[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ScriptExecutionStatus =
  'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ScriptExecution {
  id: string;
  projectId: string;
  actionId: string;
  actionName: string;
  risk: ProjectScriptRisk;
  status: ScriptExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
}

export interface ScriptExecutionHistory {
  items: ScriptExecution[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ScriptExecutionLog {
  executionId: string;
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface ScriptExecutionConfirmation {
  token: string;
  actionId: string;
  expiresAt: string;
}

export type ScriptExecutionEvent =
  | { type: 'state'; execution: ScriptExecution }
  | { type: 'log'; log: ScriptExecutionLog };
