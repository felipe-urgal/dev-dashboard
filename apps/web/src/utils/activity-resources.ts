import type { ActivityEvent, ActivityJob } from '@dev-dashboard/contracts';
import { cancelAgentTask } from '../api/agent-runtime';
import { cancelDevContainerLifecycleExecution } from '../api/dev-container';
import { cancelDeployment } from '../api/deployments';
import { stopProjectProcess } from '../api/processes';
import { cancelScriptExecution } from '../api/scripts';
import { cancelLocalCiRun } from '../api/local-ci';
import { projectToolRoute } from '../project-tools';

type ActivityItem = Pick<
  ActivityEvent,
  'projectId' | 'environmentInstanceId' | 'resourceRef'
>;
type Route = {
  name: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
};
interface ResourceHandler {
  label: string;
  route: (item: ActivityItem) => Route | null;
  cancel?: (job: ActivityJob) => Promise<unknown>;
}

const toolRoute = (
  toolId: string,
  item: ActivityItem,
  query?: Record<string, string>,
): Route =>
  projectToolRoute(toolId, item.projectId, {
    environmentInstanceId: item.environmentInstanceId,
    ...(query ? { query } : {}),
  });
const environmentToolRoute = (
  toolId: string,
  item: ActivityItem,
): Route | null =>
  item.environmentInstanceId ? toolRoute(toolId, item) : null;

// Only identifiers provided by the domain are forwarded. No execution authority is reconstructed.
const registry: Record<string, ResourceHandler> = {
  'agent-task': {
    label: 'Abrir Agente',
    route: (item) =>
      item.resourceRef?.id
        ? toolRoute('agent', item, { taskId: item.resourceRef.id })
        : null,
    cancel: (job) => cancelAgentTask(job.projectId, job.resourceRef!.id),
  },
  'managed-process': {
    label: 'Abrir processos',
    route: (item) => toolRoute('server', item),
    cancel: (job) =>
      stopProjectProcess(job.projectId, job.environmentInstanceId),
  },
  'dev-container-lifecycle': {
    label: 'Abrir Dev Container',
    route: (item) => environmentToolRoute('dev-container', item),
    cancel: (job) =>
      cancelDevContainerLifecycleExecution(
        job.projectId,
        job.environmentInstanceId!,
      ),
  },
  deployment: {
    label: 'Abrir Produção',
    route: (item) => toolRoute('production', item),
    cancel: (job) => cancelDeployment(job.projectId, job.resourceRef!.id),
  },
  'compose-execution': {
    label: 'Abrir Compose',
    route: (item) => toolRoute('compose', item),
  },
  compose: {
    label: 'Abrir Compose',
    route: (item) => toolRoute('compose', item),
  },
  // Durable lifecycle Job IDs are not provider execution authority.
  'docker-compose-lifecycle': {
    label: 'Abrir Compose',
    route: (item) => toolRoute('compose', item),
  },
  'systemd-user-lifecycle': {
    label: 'Ver diagnóstico dos serviços',
    route: (item) => toolRoute('doctor', item),
  },
  // Confirmed lifecycle steps use the canonical compose-service resource kind.
  'compose-service': {
    label: 'Abrir Compose',
    route: (item) => toolRoute('compose', item),
  },
  // Systemd units have no mutable provider screen; route to the existing
  // project-scoped, read-only diagnostics (never to Process Manager).
  'systemd-user-unit': {
    label: 'Ver diagnóstico da unidade',
    route: (item) =>
      item.resourceRef?.id
        ? toolRoute('doctor', item, { serviceRef: item.resourceRef.id })
        : null,
  },
  'stack-node': { label: 'Abrir Stacks', route: () => ({ name: 'stacks' }) },
  'stack-operation': { label: 'Abrir Stacks', route: () => ({ name: 'stacks' }) },
  'migration-mutation': {
    label: 'Abrir migrações',
    route: (item) => toolRoute('migrations', item),
  },
  'local-ci': {
    label: 'Abrir CI local',
    route: (item) => toolRoute('local-ci', item),
  },
  'local-ci-run': {
    label: 'Abrir CI local',
    route: (item) => toolRoute('local-ci', item),
    cancel: (job) => cancelLocalCiRun(job.projectId, job.resourceRef!.id),
  },
  'git-mutation': {
    label: 'Abrir Git',
    route: (item) => toolRoute('git', item),
  },
  'test-execution': {
    label: 'Abrir testes',
    route: (item) => toolRoute('tests', item),
  },
  'script-execution': {
    label: 'Abrir projeto',
    route: (item) => ({
      name: 'project-details',
      params: { projectId: item.projectId },
    }),
    cancel: (job) => cancelScriptExecution(job.projectId, job.resourceRef!.id),
  },
};

export function resolveActivityResource(item: ActivityItem): {
  label: string;
  to: Route | null;
  known: boolean;
} {
  const kind = item.resourceRef?.kind;
  if (!kind || !registry[kind])
    return {
      label: kind ? 'Recurso desconhecido' : 'Sem recurso vinculado',
      to: null,
      known: false,
    };
  const handler = registry[kind];
  return { label: handler.label, to: handler.route(item), known: true };
}

export function canCancelActivityJob(job: ActivityJob): boolean {
  if (!job.cancelSupported || !job.resourceRef?.id) return false;
  const kind = job.resourceRef.kind;
  return Boolean(
    registry[kind]?.cancel &&
    (kind !== 'dev-container-lifecycle' || job.environmentInstanceId),
  );
}

export async function cancelActivityJob(job: ActivityJob): Promise<void> {
  if (!canCancelActivityJob(job))
    throw new Error('Cancelamento não suportado para este recurso.');
  await registry[job.resourceRef!.kind]!.cancel!(job);
}
