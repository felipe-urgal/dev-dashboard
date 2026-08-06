import {
  open,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type {
  ScriptExecution,
  ScriptExecutionHistory,
  ScriptExecutionLog,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import {
  EXECUTION_ID_PATTERN,
  HISTORY_VERSION,
  LOG_LIMIT,
} from './constants.js';
import { ScriptExecutionError } from './errors.js';
import type {
  RunningExecution,
  ScriptExecutionContext,
  StoredExecution,
} from './state.js';

/**
 * Armazenamento e leitura de execuções: o `Map` em memória (`executions`) é
 * espelhado em disco (`persist`/`restore`) para sobreviver a reinícios da
 * API, com retenção limitada (`pruneHistory`) por quantidade e idade —
 * mesmo papel que o snapshot único do `ProcessManager` cumpre para
 * processos gerenciados.
 */

export function findExecution(
  context: ScriptExecutionContext,
  projectId: string,
  executionId: string,
): RunningExecution {
  const record = context.executions.get(executionId);
  if (!record || record.execution.projectId !== projectId) {
    throw new ScriptExecutionError(
      'SCRIPT_EXECUTION_NOT_FOUND',
      'Execução não encontrada.',
    );
  }
  return record;
}

export async function getExecution(
  context: ScriptExecutionContext,
  projectId: string,
  executionId: string,
): Promise<ScriptExecution> {
  const record = findExecution(context, projectId, executionId);
  await record.logFlush;
  await waitForPersistence(context, executionId);
  return { ...record.execution };
}

export async function latestExecution(
  context: ScriptExecutionContext,
  projectId: string,
): Promise<ScriptExecution | null> {
  await waitForAllPersistence(context);
  const records = Array.from(context.executions.values());
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const execution = records[index]?.execution;
    if (execution?.projectId === projectId) return { ...execution };
  }
  return null;
}

export async function executionHistory(
  context: ScriptExecutionContext,
  projectId: string,
  page = 1,
  pageSize = 20,
): Promise<ScriptExecutionHistory> {
  await waitForAllPersistence(context);
  const items = Array.from(context.executions.values())
    .map((record) => record.execution)
    .filter((execution) => execution.projectId === projectId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const total = items.length;
  return {
    items: items
      .slice((page - 1) * pageSize, page * pageSize)
      .map((item) => ({ ...item })),
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function readExecutionLog(
  context: ScriptExecutionContext,
  projectId: string,
  executionId: string,
): Promise<ScriptExecutionLog> {
  const record = findExecution(context, projectId, executionId);
  const size = (await stat(record.logPath)).size;
  const start = Math.max(0, size - LOG_LIMIT);
  const handle = await open(record.logPath, 'r');
  const buffer = Buffer.alloc(size - start);
  try {
    await handle.read(buffer, 0, buffer.length, start);
  } finally {
    await handle.close();
  }
  let content = buffer.toString('utf8');
  if (start > 0) {
    const firstLineEnd = content.indexOf('\n');
    content = firstLineEnd >= 0 ? content.slice(firstLineEnd + 1) : '';
  }
  const maskedContent = maskSensitiveLogContent(content);
  return {
    executionId,
    content: maskedContent.content,
    truncated: start > 0,
    masked: maskedContent.masked,
    redactionCount: maskedContent.redactionCount,
  };
}

function statePath(context: ScriptExecutionContext, id: string): string {
  return path.join(context.stateDirectory, `${id}.json`);
}

export async function persistExecution(
  context: ScriptExecutionContext,
  execution: ScriptExecution,
): Promise<void> {
  const stored: StoredExecution = {
    version: HISTORY_VERSION,
    execution: { ...execution },
  };
  await mkdir(context.stateDirectory, { recursive: true, mode: 0o700 });
  const target = statePath(context, execution.id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
  await rename(temporary, target);
}

export function schedulePersistence(
  context: ScriptExecutionContext,
  execution: ScriptExecution,
): void {
  const previous = context.pendingWrites.get(execution.id) ?? Promise.resolve();
  const pending = previous
    .then(() => persistExecution(context, execution))
    .then(() => pruneHistory(context));
  context.pendingWrites.set(execution.id, pending);
  // O erro continua observável pelas leituras, mas não vira rejeição não tratada no listener.
  void pending.catch(() => undefined);
  void pending
    .finally(() => {
      if (context.pendingWrites.get(execution.id) === pending) {
        context.pendingWrites.delete(execution.id);
      }
    })
    .catch(() => undefined);
}

export async function waitForPersistence(
  context: ScriptExecutionContext,
  executionId: string,
): Promise<void> {
  await context.pendingWrites.get(executionId);
}

export async function waitForAllPersistence(
  context: ScriptExecutionContext,
): Promise<void> {
  await Promise.all(context.pendingWrites.values());
}

async function removeStored(
  context: ScriptExecutionContext,
  id: string,
): Promise<void> {
  await Promise.all([
    rm(statePath(context, id), { force: true }),
    rm(path.join(context.stateDirectory, `${id}.log`), { force: true }),
  ]);
}

export async function pruneHistory(
  context: ScriptExecutionContext,
): Promise<void> {
  const now = Date.now();
  const terminal = Array.from(context.executions.values())
    .filter((record) => record.execution.status !== 'running')
    .sort((left, right) =>
      right.execution.startedAt.localeCompare(left.execution.startedAt),
    );
  const expired = terminal.filter(
    (record) =>
      now -
        Date.parse(record.execution.finishedAt ?? record.execution.startedAt) >
      context.retentionMs,
  );
  const overLimit = terminal.slice(context.historyLimit);
  const removable = new Map(
    [...expired, ...overLimit].map((record) => [record.execution.id, record]),
  );
  for (const record of removable.values()) {
    context.executions.delete(record.execution.id);
    await removeStored(context, record.execution.id);
  }
}

function validExecution(value: unknown): value is ScriptExecution {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    EXECUTION_ID_PATTERN.test(item.id) &&
    typeof item.projectId === 'string' &&
    item.projectId.length > 0 &&
    typeof item.actionId === 'string' &&
    item.actionId.length > 0 &&
    typeof item.actionName === 'string' &&
    item.actionName.length > 0 &&
    ['read-only', 'mutable', 'destructive'].includes(String(item.risk)) &&
    ['running', 'succeeded', 'failed', 'cancelled'].includes(
      String(item.status),
    ) &&
    typeof item.startedAt === 'string' &&
    Number.isFinite(Date.parse(item.startedAt)) &&
    (item.finishedAt === undefined ||
      (typeof item.finishedAt === 'string' &&
        Number.isFinite(Date.parse(item.finishedAt)))) &&
    (item.exitCode === undefined || Number.isInteger(item.exitCode))
  );
}

/**
 * Roda uma vez na construção do serviço: recupera execuções persistidas,
 * marca as que ficaram `running` (o processo morreu com a API) como
 * `failed`, e já aplica a retenção antes de aceitar a primeira chamada.
 */
export async function restoreExecutions(
  context: ScriptExecutionContext,
): Promise<void> {
  await mkdir(context.stateDirectory, { recursive: true, mode: 0o700 });
  const names = await readdir(context.stateDirectory).catch(
    () => [] as string[],
  );
  const restored: ScriptExecution[] = [];
  for (const name of names.filter(
    (item) =>
      EXECUTION_ID_PATTERN.test(item.slice(0, -5)) && item.endsWith('.json'),
  )) {
    try {
      const parsed = JSON.parse(
        await readFile(path.join(context.stateDirectory, name), 'utf8'),
      ) as Partial<StoredExecution>;
      const execution = parsed.execution;
      if (
        parsed.version !== HISTORY_VERSION ||
        !validExecution(execution) ||
        name !== `${execution.id}.json`
      )
        continue;
      if (
        Date.now() - Date.parse(execution.finishedAt ?? execution.startedAt) >
        context.retentionMs
      ) {
        await removeStored(context, execution.id);
        continue;
      }
      if (execution.status === 'running') {
        execution.status = 'failed';
        execution.finishedAt = new Date().toISOString();
        await persistExecution(context, execution);
      }
      restored.push(execution);
    } catch {
      /* Um registro corrompido não impede a recuperação dos demais. */
    }
  }
  restored.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const kept = restored.slice(-context.historyLimit);
  for (const execution of restored.slice(0, -context.historyLimit))
    await removeStored(context, execution.id);
  for (const execution of kept) {
    context.executions.set(execution.id, {
      execution,
      projectPath: '',
      logPath: path.join(context.stateDirectory, `${execution.id}.log`),
    });
  }
}
