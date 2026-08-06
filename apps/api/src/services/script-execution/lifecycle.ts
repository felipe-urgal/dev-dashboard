import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type {
  Project,
  ScriptExecution,
  ScriptExecutionVariables,
} from '@dev-dashboard/contracts';

import {
  consumeConfirmation,
  findEnabledAction,
  normalizeVariables,
  variablesSignature,
} from './authorization.js';
import { resolveCommand } from './command-resolution.js';
import { ScriptExecutionError } from './errors.js';
import { emitEvent, scheduleLogEvent } from './events.js';
import {
  findExecution,
  persistExecution,
  schedulePersistence,
} from './store.js';
import type { RunningExecution, ScriptExecutionContext } from './state.js';

/**
 * Ciclo de vida do processo: inicia (`startExecution`) reservando o slot do
 * projeto antes do primeiro `await` (fecha a corrida entre starts
 * concorrentes), acompanha saída/erro para persistir e emitir o estado
 * final, e cancela (`cancelExecution`) só depois de confirmar a identidade
 * do processo via `/proc/<pid>/cwd`, igual ao `ProcessManager`.
 */

function signalProcess(record: RunningExecution, signal: NodeJS.Signals): void {
  const pid = record.child?.pid;
  if (!pid) return;
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, signal);
  } catch {
    // O processo pode ter encerrado entre a verificação e o sinal.
  }
}

async function spawnExecution(
  context: ScriptExecutionContext,
  project: Project,
  action: Awaited<ReturnType<typeof findEnabledAction>>,
  resolved: { command: string; args: string[]; env?: ScriptExecutionVariables },
): Promise<ScriptExecution> {
  await mkdir(context.stateDirectory, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const logPath = path.join(context.stateDirectory, `${id}.log`);
  const output = context.createLogStream(logPath);
  await once(output, 'open');
  const execution: ScriptExecution = {
    id,
    projectId: project.id,
    actionId: action.id,
    actionName: action.name,
    risk: action.risk,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  const record: RunningExecution = {
    execution,
    projectPath: project.path,
    logPath,
  };
  context.executions.set(id, record);
  await persistExecution(context, execution);

  let finish: (
    status: ScriptExecution['status'],
    exitCode?: number | null,
  ) => void = () => undefined;
  const outputSettled = new Promise<void>((resolve) => {
    output.once('close', resolve);
    output.once('error', resolve);
  });

  try {
    record.child = spawn(resolved.command, resolved.args, {
      cwd: project.path,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(resolved.env ? { env: { ...process.env, ...resolved.env } } : {}),
    });
    record.child.stdout?.pipe(output, { end: false });
    record.child.stderr?.pipe(output, { end: false });
    record.child.stdout?.on('data', () => scheduleLogEvent(context, record));
    record.child.stderr?.on('data', () => scheduleLogEvent(context, record));
  } catch (error) {
    execution.status = 'failed';
    execution.finishedAt = new Date().toISOString();
    await persistExecution(context, execution);
    await new Promise<void>((resolve) => output.end(resolve));
    throw error;
  }

  finish = (
    status: ScriptExecution['status'],
    exitCode?: number | null,
  ): void => {
    if (execution.status !== 'running') return;
    execution.status = status;
    execution.finishedAt = new Date().toISOString();
    if (exitCode !== undefined && exitCode !== null)
      execution.exitCode = exitCode;
    context.activeProjects.delete(project.id);
    schedulePersistence(context, execution);
    record.logFlush = outputSettled;
    if (!output.destroyed) output.end();
    void record.logFlush.then(() => {
      scheduleLogEvent(context, record, true);
      emitEvent(context, record, {
        type: 'state',
        execution: { ...execution },
      });
    });
  };
  // Erros de escrita podem ocorrer depois de `open`; eles não devem escapar
  // como eventos sem listener nem deixar a espera pelo log pendente.
  output.on('error', () => {
    finish('failed');
    signalProcess(record, 'SIGTERM');
  });
  record.child.once('error', () => finish('failed'));
  record.child.once('close', (code, signal) =>
    finish(signal ? 'cancelled' : code === 0 ? 'succeeded' : 'failed', code),
  );
  return { ...execution };
}

export async function startExecution(
  context: ScriptExecutionContext,
  project: Project,
  actionId: string,
  confirmationToken?: string,
  receivedVariables: ScriptExecutionVariables = {},
): Promise<ScriptExecution> {
  if (context.activeProjects.has(project.id)) {
    throw new ScriptExecutionError(
      'SCRIPT_ALREADY_RUNNING',
      'Já existe uma ação em execução neste projeto.',
    );
  }
  // A reserva acontece antes do primeiro await para fechar a corrida entre starts concorrentes.
  context.activeProjects.add(project.id);

  try {
    const action = await findEnabledAction(
      context.detection,
      project,
      actionId,
    );
    const variables = normalizeVariables(action, receivedVariables);
    if (action.risk !== 'read-only') {
      consumeConfirmation(
        context,
        project.id,
        action.id,
        variablesSignature(variables),
        confirmationToken,
      );
    }
    const resolved = await resolveCommand(project, action, variables);
    return await spawnExecution(context, project, action, resolved);
  } catch (error) {
    context.activeProjects.delete(project.id);
    throw error;
  }
}

export async function cancelExecution(
  context: ScriptExecutionContext,
  projectId: string,
  executionId: string,
): Promise<ScriptExecution> {
  const record = findExecution(context, projectId, executionId);
  if (record.execution.status !== 'running' || !record.child?.pid) {
    return { ...record.execution };
  }
  const actualCwd = await readlink(`/proc/${record.child.pid}/cwd`).catch(
    () => '',
  );
  if (
    process.platform === 'linux' &&
    path.resolve(actualCwd) !== path.resolve(record.projectPath)
  ) {
    throw new ScriptExecutionError(
      'SCRIPT_EXECUTION_NOT_FOUND',
      'A identidade do processo não pôde ser confirmada.',
    );
  }
  signalProcess(record, 'SIGTERM');
  setTimeout(() => {
    if (record.execution.status === 'running') {
      signalProcess(record, 'SIGKILL');
    }
  }, 3_000).unref();
  return { ...record.execution };
}
