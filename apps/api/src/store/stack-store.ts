import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Stack } from '@dev-dashboard/contracts';

import { StackTopologyService } from '../services/stack-topology-service.js';

const STATE_FILE_NAME = 'stacks.json';

interface PersistedStackState {
  version: 1;
  stacks: Stack[];
}

export interface StackStoreOptions {
  stateDirectory?: string;
}

export class StackStore {
  private readonly stacks = new Map<string, Stack>();
  private readonly stateFilePath: string | undefined;
  private readonly topology = new StackTopologyService();

  public constructor(options: StackStoreOptions = {}) {
    this.stateFilePath = options.stateDirectory
      ? path.join(options.stateDirectory, STATE_FILE_NAME)
      : undefined;
    this.loadPersistedState();
  }

  public list(): Stack[] {
    return [...this.stacks.values()]
      .map((stack) => structuredClone(stack))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      );
  }

  public findById(stackId: string): Stack | null {
    const stack = this.stacks.get(stackId);
    return stack ? structuredClone(stack) : null;
  }

  public save(stack: Stack): Stack {
    this.topology.plan(stack);
    const persisted = structuredClone(stack);
    this.stacks.set(stack.id, persisted);
    this.persistState();
    return structuredClone(persisted);
  }

  public delete(stackId: string): boolean {
    const deleted = this.stacks.delete(stackId);
    if (deleted) this.persistState();
    return deleted;
  }

  private loadPersistedState(): void {
    if (!this.stateFilePath) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.stateFilePath, 'utf8'));
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== 'object') return;
    const state = parsed as Partial<PersistedStackState>;
    if (state.version !== 1 || !Array.isArray(state.stacks)) return;

    for (const stack of state.stacks) {
      try {
        this.topology.plan(stack);
      } catch {
        continue;
      }
      this.stacks.set(stack.id, structuredClone(stack));
    }
  }

  private persistState(): void {
    if (!this.stateFilePath) return;

    mkdirSync(path.dirname(this.stateFilePath), {
      recursive: true,
      mode: 0o700,
    });
    const tempPath = `${this.stateFilePath}.${process.pid}.tmp`;
    const state: PersistedStackState = {
      version: 1,
      stacks: [...this.stacks.values()]
        .map((stack) => structuredClone(stack))
        .sort((left, right) => left.id.localeCompare(right.id)),
    };
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(tempPath, this.stateFilePath);
  }
}
