import type {
  Stack,
  StackHealth,
  StackNodeHealth,
  StackNodeState,
  StackTopologyPlan,
} from '@dev-dashboard/contracts';

const MAX_STACK_NODES = 200;
const MAX_STACK_DEPENDENCIES = 1_000;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_NAME_LENGTH = 240;

export type StackTopologyServiceErrorCode =
  'STACK_INVALID' | 'STACK_DEPENDENCY_CYCLE';

export class StackTopologyServiceError extends Error {
  public constructor(
    public readonly code: StackTopologyServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StackTopologyServiceError';
  }
}

function isBoundedText(value: string, maximumLength: number): boolean {
  return (
    value.length > 0 &&
    value.length <= maximumLength &&
    !value.includes('\0') &&
    !value.includes('\n') &&
    !value.includes('\r')
  );
}

function validateStack(stack: Stack): void {
  if (
    !isBoundedText(stack.id, MAX_IDENTIFIER_LENGTH) ||
    !isBoundedText(stack.name, MAX_NAME_LENGTH) ||
    stack.nodes.length === 0 ||
    stack.nodes.length > MAX_STACK_NODES ||
    stack.dependencies.length > MAX_STACK_DEPENDENCIES
  ) {
    throw new StackTopologyServiceError(
      'STACK_INVALID',
      'Stack definition is invalid.',
    );
  }

  const nodeIds = new Set<string>();
  for (const node of stack.nodes) {
    if (
      !isBoundedText(node.id, MAX_IDENTIFIER_LENGTH) ||
      !isBoundedText(node.name, MAX_NAME_LENGTH) ||
      nodeIds.has(node.id)
    ) {
      throw new StackTopologyServiceError(
        'STACK_INVALID',
        'Stack node definition is invalid.',
      );
    }
    nodeIds.add(node.id);
  }

  const dependencyKeys = new Set<string>();
  for (const dependency of stack.dependencies) {
    if (
      !nodeIds.has(dependency.nodeId) ||
      !nodeIds.has(dependency.dependsOnNodeId) ||
      dependency.nodeId === dependency.dependsOnNodeId
    ) {
      throw new StackTopologyServiceError(
        'STACK_INVALID',
        'Stack dependency references are invalid.',
      );
    }

    const key = `${dependency.nodeId}\0${dependency.dependsOnNodeId}`;
    if (dependencyKeys.has(key)) {
      throw new StackTopologyServiceError(
        'STACK_INVALID',
        'Stack contains a duplicate dependency.',
      );
    }
    dependencyKeys.add(key);
  }
}

function insertSorted(queue: string[], value: string): void {
  const index = queue.findIndex((current) => current.localeCompare(value) > 0);
  if (index === -1) {
    queue.push(value);
    return;
  }
  queue.splice(index, 0, value);
}

export class StackTopologyService {
  public plan(stack: Stack): StackTopologyPlan {
    validateStack(stack);

    const indegree = new Map(stack.nodes.map((node) => [node.id, 0] as const));
    const dependents = new Map(
      stack.nodes.map((node) => [node.id, [] as string[]] as const),
    );

    for (const dependency of stack.dependencies) {
      indegree.set(
        dependency.nodeId,
        (indegree.get(dependency.nodeId) ?? 0) + 1,
      );
      dependents.get(dependency.dependsOnNodeId)!.push(dependency.nodeId);
    }

    for (const values of dependents.values()) values.sort();

    const queue = [...indegree.entries()]
      .filter(([, degree]) => degree === 0)
      .map(([nodeId]) => nodeId)
      .sort();

    const startOrder: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      startOrder.push(current);

      for (const dependent of dependents.get(current) ?? []) {
        const nextDegree = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, nextDegree);
        if (nextDegree === 0) insertSorted(queue, dependent);
      }
    }

    if (startOrder.length !== stack.nodes.length) {
      throw new StackTopologyServiceError(
        'STACK_DEPENDENCY_CYCLE',
        'Stack dependencies contain a cycle.',
      );
    }

    return {
      stackId: stack.id,
      startOrder,
      stopOrder: [...startOrder].reverse(),
    };
  }

  public health(
    stackId: string,
    nodes: readonly StackNodeHealth[],
    observedAt: string,
  ): StackHealth {
    return {
      stackId,
      state: this.aggregateHealth(nodes.map((node) => node.state)),
      observedAt,
      nodes: nodes.map((node) => ({ ...node })),
    };
  }

  private aggregateHealth(states: readonly StackNodeState[]): StackNodeState {
    if (states.length === 0) return 'unknown';
    if (states.includes('failed')) return 'failed';
    if (states.includes('blocked')) return 'blocked';
    if (states.includes('starting')) return 'starting';
    if (states.every((state) => state === 'ready')) return 'ready';
    if (states.every((state) => state === 'stopped')) return 'stopped';
    return 'unknown';
  }
}
