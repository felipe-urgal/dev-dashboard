import { promises as fs } from 'node:fs';
import path from 'node:path';

import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const MAX_ID_CHARS = 256;

export interface AgentTaskBudget {
  projectId: string;
  taskId: string;
  maxTotalTokens?: number;
  maxEstimatedCostUsd?: number;
  mode?: 'soft' | 'hard';
  updatedAt: string;
}

interface PersistedAgentBudgetState {
  version: 1;
  budgets: AgentTaskBudget[];
}

export interface AgentBudgetStoreOptions {
  stateDirectory: string;
  lockManager?: AgentTaskLockManager;
}

export type AgentBudgetStoreErrorCode =
  'AGENT_BUDGET_INVALID' | 'AGENT_BUDGET_CORRUPT';

export class AgentBudgetStoreError extends Error {
  public constructor(
    public readonly code: AgentBudgetStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentBudgetStoreError';
  }
}

function assertIdentity(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID_CHARS ||
    value.includes('\0')
  ) {
    throw new AgentBudgetStoreError(
      'AGENT_BUDGET_INVALID',
      `${label} is invalid.`,
    );
  }
}

function validInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isBudget(value: unknown): value is AgentTaskBudget {
  if (!value || typeof value !== 'object') return false;
  const budget = value as Partial<AgentTaskBudget>;
  if (
    typeof budget.projectId !== 'string' ||
    !budget.projectId ||
    budget.projectId.length > MAX_ID_CHARS ||
    budget.projectId.includes('\0') ||
    typeof budget.taskId !== 'string' ||
    !budget.taskId ||
    budget.taskId.length > MAX_ID_CHARS ||
    budget.taskId.includes('\0') ||
    !Number.isFinite(Date.parse(budget.updatedAt ?? ''))
  ) {
    return false;
  }

  if (
    budget.maxTotalTokens !== undefined &&
    !validInteger(budget.maxTotalTokens)
  ) {
    return false;
  }
  if (
    budget.maxEstimatedCostUsd !== undefined &&
    !validNumber(budget.maxEstimatedCostUsd)
  ) {
    return false;
  }
  if (
    budget.mode !== undefined &&
    budget.mode !== 'soft' &&
    budget.mode !== 'hard'
  ) {
    return false;
  }

  return (
    budget.maxTotalTokens !== undefined ||
    budget.maxEstimatedCostUsd !== undefined
  );
}

function emptyState(): PersistedAgentBudgetState {
  return { version: STORE_VERSION, budgets: [] };
}

export class AgentBudgetStore {
  private readonly filePath: string;
  private readonly lockManager: AgentTaskLockManager;

  public constructor(options: AgentBudgetStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentBudgetStoreError(
        'AGENT_BUDGET_INVALID',
        'Agent budget state directory is required.',
      );
    }
    this.filePath = path.join(options.stateDirectory, 'usage', 'budgets.json');
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
  }

  public async get(
    projectId: string,
    taskId: string,
  ): Promise<AgentTaskBudget | null> {
    assertIdentity(projectId, 'Agent budget project id');
    assertIdentity(taskId, 'Agent budget task id');
    const state = await this.readState();
    const budget = state.budgets.find(
      (candidate) =>
        candidate.projectId === projectId && candidate.taskId === taskId,
    );
    return budget ? structuredClone(budget) : null;
  }

  public async set(budget: AgentTaskBudget): Promise<AgentTaskBudget> {
    this.assertBudget(budget);
    const release = await this.lockManager.acquire(
      `agent-budget-${budget.projectId}-${budget.taskId}`,
    );
    try {
      const state = await this.readState();
      const index = state.budgets.findIndex(
        (candidate) =>
          candidate.projectId === budget.projectId &&
          candidate.taskId === budget.taskId,
      );
      if (index >= 0) {
        state.budgets[index] = structuredClone(budget);
      } else {
        state.budgets.push(structuredClone(budget));
      }
      await this.writeState(state);
      return structuredClone(budget);
    } finally {
      await release();
    }
  }

  public async clear(projectId: string, taskId: string): Promise<void> {
    assertIdentity(projectId, 'Agent budget project id');
    assertIdentity(taskId, 'Agent budget task id');
    const release = await this.lockManager.acquire(
      `agent-budget-${projectId}-${taskId}`,
    );
    try {
      const state = await this.readState();
      state.budgets = state.budgets.filter(
        (candidate) =>
          candidate.projectId !== projectId || candidate.taskId !== taskId,
      );
      await this.writeState(state);
    } finally {
      await release();
    }
  }

  private assertBudget(budget: AgentTaskBudget): void {
    assertIdentity(budget.projectId, 'Agent budget project id');
    assertIdentity(budget.taskId, 'Agent budget task id');
    if (!isBudget(budget)) {
      throw new AgentBudgetStoreError(
        'AGENT_BUDGET_INVALID',
        'Agent task budget is invalid.',
      );
    }
  }

  private async readState(): Promise<PersistedAgentBudgetState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const value: unknown = JSON.parse(raw);
      if (
        !value ||
        typeof value !== 'object' ||
        (value as { version?: unknown }).version !== STORE_VERSION ||
        !Array.isArray((value as { budgets?: unknown }).budgets) ||
        !(value as { budgets: unknown[] }).budgets.every(isBudget)
      ) {
        throw new Error('invalid state');
      }
      return value as PersistedAgentBudgetState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyState();
      }
      if (error instanceof AgentBudgetStoreError) throw error;
      throw new AgentBudgetStoreError(
        'AGENT_BUDGET_CORRUPT',
        'Agent budget state is corrupt.',
      );
    }
  }

  private async writeState(state: PersistedAgentBudgetState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.rename(tempPath, this.filePath);
  }
}
