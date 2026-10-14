import type { ActivityEvent, ActivityJob, ActivityResourceRef } from '@dev-dashboard/contracts';
import { cancelAgentTask } from '../api/agent-runtime';
import { cancelDevContainerLifecycleExecution } from '../api/dev-container';
import { cancelDeployment } from '../api/deployments';

type ActivityItem = Pick<ActivityEvent, 'projectId' | 'environmentInstanceId' | 'resourceRef'>;
type Route = { name: string; params?: Record<string, string>; query?: Record<string, string> };
interface ResourceHandler {
  label: string;
  route: (item: ActivityItem) => Route | null;
  cancel?: (job: ActivityJob) => Promise<unknown>;
}

const projectRoute = (name: string, item: ActivityItem): Route => ({
  name, params: { projectId: item.projectId },
});
const environmentRoute = (name: string, item: ActivityItem): Route | null =>
  item.environmentInstanceId
    ? { ...projectRoute(name, item), query: { environmentInstanceId: item.environmentInstanceId } }
    : null;

// Only identifiers provided by the domain are forwarded. No execution authority is reconstructed.
const registry: Record<string, ResourceHandler> = {
  'agent-task': {
    label: 'Abrir Agente',
    route: (item) => item.resourceRef?.id
      ? { ...projectRoute('project-agent', item), query: { taskId: item.resourceRef.id } }
      : null,
    cancel: (job) => cancelAgentTask(job.projectId, job.resourceRef!.id),
  },
  'managed-process': { label: 'Abrir processos', route: (item) => projectRoute('project-server', item) },
  'dev-container-lifecycle': {
    label: 'Abrir Dev Container',
    route: (item) => environmentRoute('project-dev-container', item),
    cancel: (job) => cancelDevContainerLifecycleExecution(job.projectId, job.environmentInstanceId!),
  },
  deployment: {
    label: 'Abrir Produção',
    route: (item) => projectRoute('project-production', item),
    cancel: (job) => cancelDeployment(job.projectId, job.resourceRef!.id),
  },
  'compose-execution': { label: 'Abrir Compose', route: (item) => projectRoute('project-compose', item) },
  compose: { label: 'Abrir Compose', route: (item) => projectRoute('project-compose', item) },
  'stack-node': { label: 'Abrir Stacks', route: () => ({ name: 'stacks' }) },
  'migration-mutation': { label: 'Abrir migrações', route: (item) => projectRoute('project-migrations', item) },
  'local-ci': { label: 'Abrir CI local', route: (item) => projectRoute('project-local-ci', item) },
  'local-ci-run': { label: 'Abrir CI local', route: (item) => projectRoute('project-local-ci', item) },
  'git-mutation': { label: 'Abrir Git', route: (item) => projectRoute('project-git', item) },
  'test-execution': { label: 'Abrir testes', route: (item) => projectRoute('project-tests', item) },
  'script-execution': { label: 'Abrir projeto', route: (item) => projectRoute('project-details', item) },
};

export function resolveActivityResource(item: ActivityItem): { label: string; to: Route | null; known: boolean } {
  const kind = item.resourceRef?.kind;
  if (!kind || !registry[kind]) return { label: kind ? 'Recurso desconhecido' : 'Sem recurso vinculado', to: null, known: false };
  const handler = registry[kind];
  return { label: handler.label, to: handler.route(item), known: true };
}

export function canCancelActivityJob(job: ActivityJob): boolean {
  if (!job.cancelSupported || !job.resourceRef?.id) return false;
  const kind = job.resourceRef.kind;
  return Boolean(registry[kind]?.cancel && (kind !== 'dev-container-lifecycle' || job.environmentInstanceId));
}

export async function cancelActivityJob(job: ActivityJob): Promise<void> {
  if (!canCancelActivityJob(job)) throw new Error('Cancelamento não suportado para este recurso.');
  await registry[job.resourceRef!.kind]!.cancel!(job);
}
