import type {
  TaskContext,
  TaskContextIssueRef,
  TaskContextPullRequestRef,
} from '@dev-dashboard/contracts';
import type { TaskContextRepository } from '@dev-dashboard/core';

import type { GitService } from './git-service.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

export interface CreateTaskContextBindingInput {
  environmentInstanceId?: string;
  issue?: TaskContextIssueRef;
  pullRequest?: TaskContextPullRequestRef;
}

export interface UpdateTaskContextReferencesInput {
  issue?: TaskContextIssueRef | null;
  pullRequest?: TaskContextPullRequestRef | null;
}

export type TaskContextServiceErrorCode =
  | 'TASK_CONTEXT_PROJECT_NOT_FOUND'
  | 'TASK_CONTEXT_ENVIRONMENT_NOT_FOUND'
  | 'TASK_CONTEXT_GIT_BRANCH_UNAVAILABLE'
  | 'TASK_CONTEXT_NOT_FOUND';

export class TaskContextServiceError extends Error {
  public constructor(
    public readonly code: TaskContextServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TaskContextServiceError';
  }
}

type ProjectStoreView = Pick<ProjectStore, 'findProject'>;
type EnvironmentStoreView = Pick<
  DevelopmentEnvironmentInstanceStore,
  'findById' | 'findPrimaryByProjectId'
>;
type GitReader = Pick<GitService, 'getOverview'>;
type TaskContextStore = Pick<
  TaskContextRepository,
  'create' | 'find' | 'list' | 'update' | 'remove'
>;

export class TaskContextService {
  public constructor(
    private readonly projectStore: ProjectStoreView,
    private readonly environmentStore: EnvironmentStoreView,
    private readonly gitReader: GitReader,
    private readonly repository: TaskContextStore,
  ) {}

  public list(projectId: string): readonly TaskContext[] {
    this.requireProject(projectId);
    return this.repository.list(projectId);
  }

  public async create(
    projectId: string,
    input: CreateTaskContextBindingInput = {},
  ): Promise<TaskContext> {
    this.requireProject(projectId);

    const environment = input.environmentInstanceId
      ? this.environmentStore.findById(input.environmentInstanceId)
      : this.environmentStore.findPrimaryByProjectId(projectId);
    if (!environment || environment.projectId !== projectId) {
      throw new TaskContextServiceError(
        'TASK_CONTEXT_ENVIRONMENT_NOT_FOUND',
        'A Environment Instance não foi encontrada para este projeto.',
      );
    }

    const overview = await this.gitReader.getOverview(environment.source.path);
    if (!overview.repository || overview.detached || !overview.branch) {
      throw new TaskContextServiceError(
        'TASK_CONTEXT_GIT_BRANCH_UNAVAILABLE',
        'Não há branch Git ativa para associar ao contexto.',
      );
    }

    return this.repository.create({
      projectId,
      branch: overview.branch,
      environmentInstanceId: environment.id,
      ...(environment.source.kind === 'worktree'
        ? { worktreeId: environment.source.worktreeId }
        : {}),
      ...(input.issue ? { issue: input.issue } : {}),
      ...(input.pullRequest ? { pullRequest: input.pullRequest } : {}),
    });
  }

  public async updateReferences(
    projectId: string,
    taskContextId: string,
    input: UpdateTaskContextReferencesInput,
  ): Promise<TaskContext> {
    const context = this.requireContext(projectId, taskContextId);
    return this.repository.update(context.id, {
      ...('issue' in input ? { issue: input.issue ?? null } : {}),
      ...('pullRequest' in input
        ? { pullRequest: input.pullRequest ?? null }
        : {}),
    });
  }

  public async remove(projectId: string, taskContextId: string): Promise<void> {
    const context = this.requireContext(projectId, taskContextId);
    await this.repository.remove(context.id);
  }

  private requireProject(projectId: string): void {
    if (this.projectStore.findProject(projectId)) return;
    throw new TaskContextServiceError(
      'TASK_CONTEXT_PROJECT_NOT_FOUND',
      'Projeto não encontrado.',
    );
  }

  private requireContext(
    projectId: string,
    taskContextId: string,
  ): TaskContext {
    this.requireProject(projectId);
    const context = this.repository.find(taskContextId);
    if (context?.projectId === projectId) return context;
    throw new TaskContextServiceError(
      'TASK_CONTEXT_NOT_FOUND',
      'O contexto da tarefa não foi encontrado.',
    );
  }
}
