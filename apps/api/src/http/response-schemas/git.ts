export const gitCommitResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['hash', 'shortHash', 'subject', 'authorName', 'authorEmail', 'authoredAt'],
  properties: { hash: { type: 'string' }, shortHash: { type: 'string' }, subject: { type: 'string' }, authorName: { type: 'string' }, authorEmail: { type: 'string' }, authoredAt: { type: 'string' } },
} as const;

export const gitFileChangeResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['path', 'indexStatus', 'worktreeStatus', 'status'],
  properties: {
    path: { type: 'string' }, previousPath: { type: 'string' }, indexStatus: { type: 'string' }, worktreeStatus: { type: 'string' },
    status: { type: 'string', enum: ['added', 'modified', 'deleted', 'renamed', 'copied', 'untracked', 'conflicted', 'type-changed'] },
  },
} as const;

export const projectGitOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['repository', 'detached', 'ahead', 'behind', 'clean', 'files', 'recentCommits'],
  properties: {
    repository: { type: 'boolean' }, branch: { type: 'string' }, detached: { type: 'boolean' }, upstream: { type: 'string' }, ahead: { type: 'integer', minimum: 0 }, behind: { type: 'integer', minimum: 0 }, clean: { type: 'boolean' }, files: { type: 'array', items: gitFileChangeResponseSchema }, latestCommit: gitCommitResponseSchema, recentCommits: { type: 'array', items: gitCommitResponseSchema },
  },
} as const;

const gitFileStatusEnum = ['added', 'modified', 'deleted', 'renamed', 'copied', 'untracked', 'conflicted', 'type-changed'] as const;

export const gitDiffSnapshotResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['repository', 'scope', 'files'],
  properties: {
    repository: { type: 'boolean' },
    scope: { type: 'string', enum: ['worktree', 'index', 'combined'] },
    files: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['path', 'status', 'additions', 'deletions', 'binary'],
        properties: {
          path: { type: 'string' },
          previousPath: { type: 'string' },
          status: { type: 'string', enum: gitFileStatusEnum },
          additions: { type: 'integer', minimum: 0 },
          deletions: { type: 'integer', minimum: 0 },
          binary: { type: 'boolean' },
        },
      },
    },
  },
} as const;

export const gitMutationConfirmationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['token', 'operation', 'target', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    operation: { type: 'string', enum: ['create-branch', 'switch-branch', 'pull', 'push', 'commit'] },
    target: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const projectChangeImpactActionResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['category', 'label', 'description', 'matchedPaths'],
  properties: {
    category: { type: 'string', enum: ['dependencies', 'database', 'environment', 'server', 'tests'] },
    label: { type: 'string' },
    description: { type: 'string' },
    routeName: { type: 'string' },
    matchedPaths: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const projectChangeImpactResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['previousSha', 'currentSha', 'changedPaths', 'actions'],
  properties: {
    previousSha: { type: 'string' },
    currentSha: { type: 'string' },
    changedPaths: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: projectChangeImpactActionResponseSchema },
  },
} as const;

export const gitBranchMutationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['branch'],
  properties: { branch: { type: 'string' }, impact: projectChangeImpactResponseSchema },
} as const;

export const gitCommitMutationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['hash', 'shortHash', 'subject'],
  properties: { hash: { type: 'string' }, shortHash: { type: 'string' }, subject: { type: 'string' } },
} as const;

export const gitFileDiffResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['path', 'scope', 'status', 'binary', 'content', 'truncated', 'masked', 'redactionCount'],
  properties: {
    path: { type: 'string' },
    scope: { type: 'string', enum: ['worktree', 'index', 'combined'] },
    status: { type: 'string', enum: gitFileStatusEnum },
    binary: { type: 'boolean' },
    content: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

export const gitFileLinesResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['path', 'scope', 'start', 'end', 'totalLines', 'lines', 'masked', 'redactionCount'],
  properties: {
    path: { type: 'string' },
    scope: { type: 'string', enum: ['worktree', 'index', 'combined'] },
    start: { type: 'integer', minimum: 1 },
    end: { type: 'integer', minimum: 0 },
    totalLines: { type: 'integer', minimum: 0 },
    lines: { type: 'array', items: { type: 'string' } },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

export const gitMutationHistoryEventResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'operationId', 'risk', 'occurredAt', 'result'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    workspaceId: { type: 'string' },
    operationId: { type: 'string' },
    risk: { type: 'string', enum: ['read-only', 'write-safe', 'write-remote', 'destructive'] },
    occurredAt: { type: 'string' },
    result: { type: 'string', enum: ['succeeded', 'failed'] },
    errorCode: { type: 'string' },
  },
} as const;

export const gitMutationHistoryPageResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['projectId', 'page', 'pageSize', 'total', 'totalPages', 'events'],
  properties: {
    projectId: { type: 'string' },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
    events: { type: 'array', items: gitMutationHistoryEventResponseSchema },
  },
} as const;

export const gitPullRequestUrlResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['provider', 'url', 'branch', 'defaultBranch'],
  properties: {
    provider: { type: 'string', enum: ['github', 'gitlab'] },
    url: { type: 'string' },
    branch: { type: 'string' },
    defaultBranch: { type: 'string' },
  },
} as const;
