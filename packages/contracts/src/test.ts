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
  /**
   * Suporta filtrar por padrão de nome de `describe`/`it` (ex. `node --test`,
   * Jest, Vitest via `-t`/`--test-name-pattern`).
   */
  supportsNamePatternTarget: boolean;
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

/**
 * Escopo efetivamente executado. `targeted` não equivale a uma suíte completa
 * para gates de readiness; ele apenas registra que houve um alvo específico.
 */
export type TestExecutionScope = 'full-suite' | 'targeted';

export interface TestExecutionRecord {
  id: string;
  projectId: string;
  commandId: string;
  /**
   * Opcional no contrato público durante a migração do schema HTTP. O serviço
   * de histórico normaliza e persiste este campo para todos os registros.
   */
  scope?: TestExecutionScope;
  targetFile?: string;
  /** Commit HEAD capturado no início da execução, quando o projeto é Git. */
  gitRevision?: string;
  /**
   * `clean` para working tree limpo ou SHA-256 do estado dirty capturado no
   * início. Ausente significa que não houve evidência suficiente para comparar
   * o working tree com segurança.
   */
  gitDirtyFingerprint?: string;
  /** Reservado para a identidade explícita de Environment Instance (#598). */
  environmentInstanceId?: string;
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
