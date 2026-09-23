import type {
  AgentCapability,
  AgentTask,
  AgentTaskState,
} from './contracts.js';

const TASK_STATES = new Set<AgentTaskState>([
  'queued',
  'running',
  'checkpoint',
  'review',
  'blocked',
  'failed',
  'completed',
  'cancelled',
]);

const CAPABILITIES = new Set<AgentCapability>([
  'workspace:write',
  'git:commit',
  'git:push',
  'github:pull-request',
  'github:merge',
  'deployment:run',
  'release:run',
]);

const TASK_KEYS = new Set([
  'id',
  'projectId',
  'environmentInstanceId',
  'taskContextId',
  'state',
  'summary',
  'continuationInstruction',
  'requestedCapabilities',
  'createdAt',
  'updatedAt',
]);

export class AgentSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentSerializationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];

  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new AgentSerializationError(`Invalid AgentTask.${key}`);
  }

  return candidate;
}

export function serializeAgentTask(task: AgentTask): string {
  return JSON.stringify(task);
}

export function deserializeAgentTask(serialized: string): AgentTask {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new AgentSerializationError('AgentTask is not valid JSON');
  }

  if (!isRecord(parsed)) {
    throw new AgentSerializationError('AgentTask must be an object');
  }

  for (const key of Object.keys(parsed)) {
    if (!TASK_KEYS.has(key)) {
      throw new AgentSerializationError(`Unexpected AgentTask field: ${key}`);
    }
  }

  const state = parsed.state;
  if (typeof state !== 'string' || !TASK_STATES.has(state as AgentTaskState)) {
    throw new AgentSerializationError('Invalid AgentTask.state');
  }

  const requestedCapabilities = parsed.requestedCapabilities;
  if (!Array.isArray(requestedCapabilities)) {
    throw new AgentSerializationError(
      'Invalid AgentTask.requestedCapabilities',
    );
  }

  const capabilities = requestedCapabilities.map((capability) => {
    if (
      typeof capability !== 'string' ||
      !CAPABILITIES.has(capability as AgentCapability)
    ) {
      throw new AgentSerializationError('Invalid AgentTask capability');
    }

    return capability as AgentCapability;
  });

  const continuationInstruction = parsed.continuationInstruction;
  if (
    continuationInstruction !== undefined &&
    (typeof continuationInstruction !== 'string' ||
      continuationInstruction.length === 0 ||
      continuationInstruction.length > 4_000)
  ) {
    throw new AgentSerializationError(
      'Invalid AgentTask.continuationInstruction',
    );
  }

  const taskContextId = parsed.taskContextId;
  if (
    taskContextId !== undefined &&
    (typeof taskContextId !== 'string' ||
      taskContextId.length === 0 ||
      taskContextId.length > 256)
  ) {
    throw new AgentSerializationError('Invalid AgentTask.taskContextId');
  }

  const environmentInstanceId = parsed.environmentInstanceId;
  if (
    environmentInstanceId !== undefined &&
    (typeof environmentInstanceId !== 'string' ||
      environmentInstanceId.length === 0)
  ) {
    throw new AgentSerializationError(
      'Invalid AgentTask.environmentInstanceId',
    );
  }

  const task: AgentTask = {
    id: requiredString(parsed, 'id'),
    projectId: requiredString(parsed, 'projectId'),
    state: state as AgentTaskState,
    summary: requiredString(parsed, 'summary'),
    ...(continuationInstruction !== undefined
      ? { continuationInstruction }
      : {}),
    requestedCapabilities: capabilities,
    createdAt: requiredString(parsed, 'createdAt'),
    updatedAt: requiredString(parsed, 'updatedAt'),
  };

  if (environmentInstanceId !== undefined) {
    task.environmentInstanceId = environmentInstanceId;
  }

  return task;
}
