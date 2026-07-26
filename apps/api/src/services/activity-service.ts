import type {
  Activity,
  ActivityList,
  ActivityOrigin,
  ActivityStatus,
  ManagedProcess,
  ScriptExecution,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { ProjectStore } from '../store/project-store.js';
import type { ScriptExecutionService } from './script-execution-service.js';

export interface ActivityQuery {
  workspaceId?: string;
  projectId?: string;
  origin?: ActivityOrigin;
  status?: ActivityStatus;
  page?: number;
  pageSize?: number;
}

const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 50;

function mapScriptStatus(status: ScriptExecutionStatus): ActivityStatus {
  return status;
}

function mapProcessStatus(process: ManagedProcess): ActivityStatus {
  switch (process.status) {
    case 'starting':
    case 'running':
      return 'running';
    case 'stopping':
      return 'running';
    case 'stopped':
      if (process.exitCode === 0) return 'succeeded';
      if (process.exitCode === undefined) return 'cancelled';
      return 'failed';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

function scriptTimestamp(execution: ScriptExecution): string {
  return execution.finishedAt ?? execution.startedAt;
}

function processTimestamp(process: ManagedProcess): string {
  return process.stoppedAt ?? process.startedAt ?? new Date(0).toISOString();
}

export class ActivityService {
  public constructor(
    private readonly projectStore: ProjectStore,
    private readonly processManager: ProcessManager,
    private readonly scriptExecutionService: ScriptExecutionService,
  ) {}

  public async list(query: ActivityQuery = {}): Promise<ActivityList> {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));

    const projects = this.projectStore.listProjects();
    const projectsById = new Map(projects.map((project) => [project.id, project]));

    const eligibleProjects = projects.filter((project) => {
      if (query.workspaceId && project.workspaceId !== query.workspaceId) return false;
      if (query.projectId && project.id !== query.projectId) return false;
      return true;
    });
    const eligibleIds = new Set(eligibleProjects.map((project) => project.id));

    const activities: Activity[] = [];

    if (!query.origin || query.origin === 'script') {
      for (const project of eligibleProjects) {
        const executions: ScriptExecution[] = [];
        for (let pageIndex = 1; pageIndex <= HISTORY_MAX_PAGES; pageIndex += 1) {
          const history = await this.scriptExecutionService.history(project.id, pageIndex, HISTORY_PAGE_SIZE);
          executions.push(...history.items);
          if (pageIndex >= history.totalPages || history.items.length === 0) break;
        }
        for (const execution of executions) {
          activities.push({
            id: `script:${execution.id}`,
            projectId: execution.projectId,
            ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
            label: execution.actionName,
            origin: 'script',
            status: mapScriptStatus(execution.status),
            startedAt: execution.startedAt,
            ...(execution.finishedAt ? { finishedAt: execution.finishedAt } : {}),
            reference: {
              executionId: execution.id,
              actionId: execution.actionId,
            },
          });
        }
      }
    }

    if (!query.origin || query.origin === 'test' || query.origin === 'server') {
      const managed = await this.processManager.listProcesses();
      for (const process of managed) {
        if (!eligibleIds.has(process.projectId)) continue;
        if (process.kind !== 'server' && process.kind !== 'test') continue;
        if (query.origin && query.origin !== process.kind) continue;

        const project = projectsById.get(process.projectId);
        const workspaceId = process.workspaceId ?? project?.workspaceId;
        const label = process.kind === 'server' ? 'Servidor' : 'Testes';

        activities.push({
          id: `${process.kind}:${process.id}`,
          projectId: process.projectId,
          ...(workspaceId ? { workspaceId } : {}),
          label,
          origin: process.kind,
          status: mapProcessStatus(process),
          startedAt: processTimestamp(process),
          ...(process.stoppedAt ? { finishedAt: process.stoppedAt } : {}),
          reference: { processId: process.id },
        } as Activity);
      }
    }

    const filtered = query.status
      ? activities.filter((activity) => activity.status === query.status)
      : activities;

    filtered.sort((left, right) => {
      const timeCompare = right.startedAt.localeCompare(left.startedAt);
      if (timeCompare !== 0) return timeCompare;
      return right.id.localeCompare(left.id);
    });

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { items, page, pageSize, total, totalPages };
  }
}
