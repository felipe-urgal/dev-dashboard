import type { ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';

import type {
  ScriptExecution,
  ScriptExecutionConfirmation,
  ScriptExecutionEvent,
} from '@dev-dashboard/contracts';

import type { ScriptDetectionService } from '../script-detection-service.js';

export interface RunningExecution {
  execution: ScriptExecution;
  projectPath: string;
  logPath: string;
  child?: ChildProcess;
  logFlush?: Promise<void>;
}

export interface StoredConfirmation extends ScriptExecutionConfirmation {
  projectId: string;
  variablesSignature: string;
}

export interface StoredExecution {
  version: 1;
  execution: ScriptExecution;
}

export interface ExecutionSubscriber {
  send: (event: ScriptExecutionEvent) => void;
  close: () => void;
}

/**
 * Estado compartilhado entre os módulos por domínio (autorização, ciclo de
 * vida, eventos, armazenamento) — o equivalente do `ProcessStoreContext` de
 * `@dev-dashboard/process-manager`, mas para `ScriptExecutionService`. Cada
 * módulo recebe este contexto em vez de manter seu próprio `Map` privado.
 */
export interface ScriptExecutionContext {
  readonly executions: Map<string, RunningExecution>;
  readonly activeProjects: Set<string>;
  readonly confirmations: Map<string, StoredConfirmation>;
  readonly pendingWrites: Map<string, Promise<void>>;
  readonly subscribers: Map<string, Set<ExecutionSubscriber>>;
  readonly eventTimers: Map<string, NodeJS.Timeout>;
  readonly stateDirectory: string;
  readonly historyLimit: number;
  readonly retentionMs: number;
  readonly createLogStream: (logPath: string) => Writable;
  readonly detection: ScriptDetectionService;
}
