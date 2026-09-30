import type {
  ActivityEventStatus,
  Stack,
  StackNode,
} from '@dev-dashboard/contracts';

interface StackActivityAppendInput {
  projectId: string;
  environmentInstanceId?: string;
  domain: 'stack';
  type: string;
  status: ActivityEventStatus;
  summary: string;
  resourceRef: {
    kind: 'stack-node';
    id: string;
  };
}

export interface StackActivityWriter {
  append(input: StackActivityAppendInput): Promise<unknown>;
}

export type StackActivityAction = 'start' | 'stop' | 'restart';

interface RecordStackActivityInput {
  stack: Stack;
  node: StackNode;
  action: StackActivityAction;
  status: ActivityEventStatus;
  diagnostic?: string;
}

function actionLabel(action: StackActivityAction): string {
  if (action === 'start') return 'iniciar';
  if (action === 'stop') return 'parar';
  return 'reiniciar';
}

function environmentInstanceId(node: StackNode): string | undefined {
  return 'environmentInstanceId' in node.target
    ? node.target.environmentInstanceId
    : undefined;
}

export async function recordStackActivity(
  writer: StackActivityWriter | undefined,
  input: RecordStackActivityInput,
): Promise<void> {
  if (!writer) return;

  const diagnostic = input.diagnostic ? ` · ${input.diagnostic}` : '';
  try {
    await writer.append({
      projectId: input.node.target.projectId,
      ...(environmentInstanceId(input.node)
        ? { environmentInstanceId: environmentInstanceId(input.node) }
        : {}),
      domain: 'stack',
      type: `stack.${input.action}`,
      status: input.status,
      summary: `Stack ${input.stack.name}: ${actionLabel(input.action)} ${input.node.name}${diagnostic}`,
      resourceRef: {
        kind: 'stack-node',
        id: `${input.stack.id}:${input.node.id}`,
      },
    });
  } catch {
    // Observabilidade nunca deve alterar o resultado do lifecycle principal.
  }
}
