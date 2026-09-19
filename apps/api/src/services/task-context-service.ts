import type {
  GitOpenPullRequest,
  GitPullRequestLookup,
  Project,
  TaskContext,
  TaskContextEvidence,
  TaskContextIssueRef,
  TaskContextPullRequestRef,
  TaskContextReadinessStatus,
  TaskContextSnapshot,
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

export interface TaskContextEvidenceReaders {
  pullRequestLookup?: {
    findOpenPullRequest(projectPath: string): Promise<GitPullRequestLookup>;
  };
  pullRequestStatus?: {
    enrich(
      projectPath: string,
      pullRequest: GitOpenPullRequest,
    ): Promise<GitOpenPullRequest>;
  };
  readiness?: {
    getSnapshot(
      project: Project,
      options: { testMaxAgeMs: number },
    ): Promise<{
      state: TaskContextReadinessStatus;
      generatedAt: string;
    }>;
  };
}

const READINESS_TEST_MAX_AGE_MS = 30 * 60 * 1000;

function githubRepositoryFromPullRequestUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'github.com') return undefined;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4 || parts[2] !== 'pull') return undefined;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return undefined;
  }
}

function matchesExplicitPullRequest(
  pullRequest: GitOpenPullRequest,
  reference: TaskContextPullRequestRef,
  branch: string,
): boolean {
  const repository = githubRepositoryFromPullRequestUrl(pullRequest.url);
  return (
    pullRequest.provider === 'github' &&
    pullRequest.number === reference.number &&
    pullRequest.sourceBranch === branch &&
    repository?.toLowerCase() === reference.repository.toLowerCase()
  );
}

async function safely<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    return undefined;
  }
}

export class TaskContextService {
  public constructor(
    private readonly projectStore: ProjectStoreView,
    private readonly environmentStore: EnvironmentStoreView,
    private readonly gitReader: GitReader,
    private readonly repository: TaskContextStore,
    private readonly now: () => Date = () => new Date(),
    private readonly evidenceReaders: TaskContextEvidenceReaders = {},
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

  public async snapshot(
    projectId: string,
    taskContextId: string,
  ): Promise<TaskContextSnapshot> {
    const project = this.requireProject(projectId);
    const context = this.requireContext(projectId, taskContextId);
    const evidence: TaskContextEvidence = {
      observedAt: this.now().toISOString(),
    };
    const environment = context.environmentInstanceId
      ? this.environmentStore.findById(context.environmentInstanceId)
      : this.environmentStore.findPrimaryByProjectId(projectId);

    if (!environment || environment.projectId !== projectId) {
      return { context, evidence };
    }

    const overview = await safely(() =>
      this.gitReader.getOverview(environment.source.path),
    );
    if (overview) {
      const currentBranch =
        overview.repository && !overview.detached ? overview.branch : undefined;
      const branchMatches =
        currentBranch !== undefined && currentBranch === context.branch;
      if (currentBranch) evidence.currentBranch = currentBranch;
      evidence.branchMatches = branchMatches;
      if (branchMatches && overview.latestCommit) {
        evidence.headSha = overview.latestCommit.hash;
      }
    }

    await Promise.all([
      this.hydratePullRequestEvidence(
        context,
        environment.source.path,
        evidence,
      ),
      this.hydrateReadinessEvidence(project, environment.source.kind, evidence),
    ]);

    return { context, evidence };
  }

  public async remove(projectId: string, taskContextId: string): Promise<void> {
    const context = this.requireContext(projectId, taskContextId);
    await this.repository.remove(context.id);
  }

  private async hydratePullRequestEvidence(
    context: TaskContext,
    projectPath: string,
    evidence: TaskContextEvidence,
  ): Promise<void> {
    const reference = context.pullRequest;
    const lookupReader = this.evidenceReaders.pullRequestLookup;
    const statusReader = this.evidenceReaders.pullRequestStatus;
    if (
      !reference ||
      evidence.branchMatches !== true ||
      !lookupReader ||
      !statusReader
    ) {
      return;
    }

    const lookup = await safely(() =>
      lookupReader.findOpenPullRequest(projectPath),
    );
    const candidate = lookup?.existing;
    if (
      !candidate ||
      !matchesExplicitPullRequest(candidate, reference, context.branch)
    ) {
      return;
    }

    const enriched = await safely(() =>
      statusReader.enrich(projectPath, candidate),
    );
    if (!enriched) return;

    evidence.pullRequest = enriched;
    evidence.pullRequestObservedAt = this.now().toISOString();
  }

  private async hydrateReadinessEvidence(
    project: Project,
    environmentKind: 'primary' | 'worktree',
    evidence: TaskContextEvidence,
  ): Promise<void> {
    const reader = this.evidenceReaders.readiness;
    if (!reader || environmentKind !== 'primary') return;

    const readiness = await safely(() =>
      reader.getSnapshot(project, {
        testMaxAgeMs: READINESS_TEST_MAX_AGE_MS,
      }),
    );
    if (!readiness) return;

    evidence.readiness = {
      status: readiness.state,
      observedAt: readiness.generatedAt,
    };
  }

  private requireProject(projectId: string): Project {
    const project = this.projectStore.findProject(projectId);
    if (project) return project;
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
