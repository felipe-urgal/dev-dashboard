import type {
  Deployment,
  DeploymentConfirmation,
  DeploymentPlan,
  DeploymentStatus,
  ProductionOverviewItem,
} from '@dev-dashboard/contracts';

const TERMINAL_STATUSES = new Set<DeploymentStatus>([
  'succeeded',
  'failed',
  'recovery_required',
  'cancelled',
]);

export type ProductionBatchItemStatus =
  | 'ready'
  | 'skipped'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'recovery-required'
  | 'not-started';

export interface ProductionBatchItem {
  projectId: string;
  projectName: string;
  plan?: DeploymentPlan;
  status: ProductionBatchItemStatus;
  deploymentId?: string;
  deploymentStatus?: DeploymentStatus;
  message?: string;
}

export interface ProductionBatchApi {
  fetchPlan(projectId: string, signal?: AbortSignal): Promise<DeploymentPlan>;
  createConfirmation(
    projectId: string,
    planHash: string,
    signal?: AbortSignal,
  ): Promise<DeploymentConfirmation>;
  startDeployment(
    projectId: string,
    planHash: string,
    confirmationToken: string,
    signal?: AbortSignal,
  ): Promise<Deployment>;
  fetchDeployment(
    projectId: string,
    deploymentId: string,
    signal?: AbortSignal,
  ): Promise<Deployment>;
}

export interface ExecuteProductionBatchOptions {
  signal?: AbortSignal;
  pollIntervalMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  onUpdate?: (items: ProductionBatchItem[]) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function abortError(): Error {
  const error = new Error('Operação cancelada.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function snapshot(items: ProductionBatchItem[]): ProductionBatchItem[] {
  return items.map((item) => ({ ...item }));
}

function notify(
  items: ProductionBatchItem[],
  onUpdate?: (items: ProductionBatchItem[]) => void,
): void {
  onUpdate?.(snapshot(items));
}

function markRemainingNotStarted(
  items: ProductionBatchItem[],
  startIndex: number,
): void {
  for (let index = startIndex; index < items.length; index += 1) {
    if (items[index]?.status === 'queued') items[index].status = 'not-started';
  }
}

function terminalItemStatus(
  status: DeploymentStatus,
): Extract<
  ProductionBatchItemStatus,
  'succeeded' | 'failed' | 'cancelled' | 'recovery-required'
> {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'recovery_required') return 'recovery-required';
  return 'failed';
}

async function waitForTerminalDeployment(
  projectId: string,
  deployment: Deployment,
  api: ProductionBatchApi,
  options: ExecuteProductionBatchOptions,
): Promise<Deployment> {
  let current = deployment;
  const delay = options.pollIntervalMs ?? 700;
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)));

  while (!TERMINAL_STATUSES.has(current.status)) {
    throwIfAborted(options.signal);
    await sleep(delay);
    throwIfAborted(options.signal);
    current = await api.fetchDeployment(
      projectId,
      current.id,
      options.signal,
    );
  }

  return current;
}

export async function prepareProductionBatch(
  overviewItems: ProductionOverviewItem[],
  api: ProductionBatchApi,
  signal?: AbortSignal,
): Promise<ProductionBatchItem[]> {
  const pending = overviewItems.filter(
    (item) => item.state === 'drift' && item.strategy !== 'disabled',
  );
  const items: ProductionBatchItem[] = [];

  for (const item of pending) {
    throwIfAborted(signal);
    try {
      const plan = await api.fetchPlan(item.projectId, signal);
      items.push({
        projectId: item.projectId,
        projectName: item.projectName,
        plan,
        status: 'ready',
      });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      items.push({
        projectId: item.projectId,
        projectName: item.projectName,
        status: 'skipped',
        message: errorMessage(
          error,
          'Não foi possível gerar um plano válido para este projeto.',
        ),
      });
    }
  }

  return items;
}

export async function executeProductionBatch(
  preparedItems: ProductionBatchItem[],
  api: ProductionBatchApi,
  options: ExecuteProductionBatchOptions = {},
): Promise<ProductionBatchItem[]> {
  const items = preparedItems.map((item) => ({
    ...item,
    status:
      item.status === 'ready'
        ? ('queued' as ProductionBatchItemStatus)
        : item.status,
  }));
  notify(items, options.onUpdate);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item?.plan || item.status !== 'queued') continue;

    throwIfAborted(options.signal);
    item.status = 'running';
    item.message = undefined;
    notify(items, options.onUpdate);

    try {
      const confirmation = await api.createConfirmation(
        item.projectId,
        item.plan.planHash,
        options.signal,
      );
      throwIfAborted(options.signal);

      const started = await api.startDeployment(
        item.projectId,
        item.plan.planHash,
        confirmation.token,
        options.signal,
      );
      item.deploymentId = started.id;
      item.deploymentStatus = started.status;
      notify(items, options.onUpdate);

      const terminal = await waitForTerminalDeployment(
        item.projectId,
        started,
        api,
        options,
      );
      item.deploymentId = terminal.id;
      item.deploymentStatus = terminal.status;
      item.status = terminalItemStatus(terminal.status);
      item.message = terminal.errorMessage;
      notify(items, options.onUpdate);

      if (terminal.status === 'succeeded') continue;

      markRemainingNotStarted(items, index + 1);
      notify(items, options.onUpdate);
      return snapshot(items);
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) throw error;
      item.status = 'failed';
      item.message = errorMessage(
        error,
        'Não foi possível iniciar ou acompanhar este deployment.',
      );
      markRemainingNotStarted(items, index + 1);
      notify(items, options.onUpdate);
      return snapshot(items);
    }
  }

  return snapshot(items);
}
