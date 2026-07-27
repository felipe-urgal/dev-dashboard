export const apiErrorDetailsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: {
    path: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
  },
} as const;

export const apiErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'message'],
  properties: {
    error: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'array',
      items: apiErrorDetailsResponseSchema,
    },
  },
} as const;

export const commonErrorResponseSchemas = {
  400: apiErrorResponseSchema,
  401: apiErrorResponseSchema,
  403: apiErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
  500: apiErrorResponseSchema,
} as const;

export const emptyResponseSchema = {
  type: 'null',
} as const;

export const projectScriptCatalogResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'description', 'command', 'origin', 'risk', 'enabled'], properties: {
      id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, command: { type: 'string' },
      origin: { type: 'string', enum: ['package-script', 'rails-task', 'bin'] },
      risk: { type: 'string', enum: ['read-only', 'mutable', 'destructive'] }, enabled: { type: 'boolean' },
    } } },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' },
  },
} as const;

export const scriptExecutionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'actionId', 'actionName', 'risk', 'status', 'startedAt'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    actionId: { type: 'string' },
    actionName: { type: 'string' },
    risk: { type: 'string', enum: ['read-only', 'mutable', 'destructive'] },
    status: { type: 'string', enum: ['running', 'succeeded', 'failed', 'cancelled'] },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const latestScriptExecutionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['execution'],
  properties: {
    execution: {
      anyOf: [scriptExecutionResponseSchema, { type: 'null' }],
    },
  },
} as const;

export const scriptExecutionHistoryResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: scriptExecutionResponseSchema },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' },
  },
} as const;

export const scriptExecutionLogResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['executionId', 'content', 'truncated', 'masked', 'redactionCount'],
  properties: {
    executionId: { type: 'string' },
    content: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

export const scriptExecutionConfirmationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'actionId', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    actionId: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const workspaceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'path', 'enabled'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    path: { type: 'string' },
    enabled: { type: 'boolean' },
  },
} as const;

export const projectResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'path',
    'type',
    'source',
    'favorite',
    'capabilities',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    path: { type: 'string' },
    type: {
      type: 'string',
      enum: ['rails', 'node', 'unknown'],
    },
    source: {
      type: 'string',
      enum: ['workspace', 'standalone'],
    },
    workspaceId: { type: 'string' },
    port: { type: 'integer' },
    favorite: { type: 'boolean' },
    capabilities: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'server',
          'git',
          'tests',
          'database',
          'scripts',
          'webpack',
          'sidekiq',
          'rake',
          'bundler',
        ],
      },
    },
  },
} as const;

export const workspaceScanWarningResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'code', 'message'],
  properties: {
    path: { type: 'string' },
    code: {
      type: 'string',
      enum: [
        'UNREADABLE_DIRECTORY',
        'PROJECT_DETECTION_FAILED',
      ],
    },
    message: { type: 'string' },
  },
} as const;

export const managedProcessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'kind', 'status'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    workspaceId: { type: 'string' },
    kind: {
      type: 'string',
      enum: [
        'server',
        'webpack',
        'worker',
        'test',
        'script',
      ],
    },
    status: {
      type: 'string',
      enum: [
        'starting',
        'running',
        'stopping',
        'stopped',
        'failed',
      ],
    },
    pid: { type: 'integer' },
    port: { type: 'integer' },
    url: { type: 'string' },
    urls: {
      type: 'array',
      items: { type: 'string' },
    },
    command: { type: 'string' },
    args: {
      type: 'array',
      items: { type: 'string' },
    },
    startedAt: { type: 'string' },
    stoppedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const nullableManagedProcessResponseSchema = {
  ...managedProcessResponseSchema,
  type: ['object', 'null'],
} as const;

export const processLogSnapshotResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'processId',
    'content',
    'sizeBytes',
    'truncated',
    'masked',
    'redactionCount',
    'readAt',
  ],
  properties: {
    projectId: { type: 'string' },
    processId: { type: 'string' },
    content: { type: 'string' },
    sizeBytes: { type: 'integer' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
    updatedAt: { type: 'string' },
    readAt: { type: 'string' },
  },
} as const;

export const projectServerSettingsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string' },
    port: { type: 'integer' },
    updatedAt: { type: 'string' },
  },
} as const;

export const logRetentionSweepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['removed', 'removedCount'],
  properties: {
    removed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
        },
      },
    },
    removedCount: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

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

export const gitStashEntryResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['index', 'message', 'createdAt'],
  properties: {
    index: { type: 'integer', minimum: 0 }, message: { type: 'string' }, createdAt: { type: 'string' },
  },
} as const;

export const projectTestCommandResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'runner', 'label', 'description', 'origin', 'priority', 'supportsFileTarget'],
  properties: {
    id: { type: 'string' },
    runner: {
      type: 'string',
      enum: ['vitest', 'jest', 'node-test', 'rspec', 'rails-test', 'minitest', 'pytest'],
    },
    label: { type: 'string' },
    description: { type: 'string' },
    origin: {
      type: 'string',
      enum: ['package-script', 'binary', 'gemfile', 'directory', 'python-config'],
    },
    originDetail: { type: 'string' },
    priority: { type: 'integer' },
    supportsFileTarget: { type: 'boolean' },
  },
} as const;

export const projectTestFileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path'],
  properties: {
    path: { type: 'string' },
  },
} as const;

export const testExecutionRecordResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'commandId', 'status', 'startedAt'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    commandId: { type: 'string' },
    targetFile: { type: 'string' },
    status: { type: 'string', enum: ['starting', 'running', 'stopping', 'stopped', 'failed'] },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const testExecutionHistoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: testExecutionRecordResponseSchema },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
} as const;

export const projectTestOverviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['supported', 'commands'],
  properties: {
    supported: { type: 'boolean' },
    commands: {
      type: 'array',
      items: projectTestCommandResponseSchema,
    },
  },
} as const;

export const projectGitOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['repository', 'detached', 'ahead', 'behind', 'clean', 'files', 'recentCommits', 'stashes'],
  properties: {
    repository: { type: 'boolean' }, branch: { type: 'string' }, detached: { type: 'boolean' }, upstream: { type: 'string' }, ahead: { type: 'integer', minimum: 0 }, behind: { type: 'integer', minimum: 0 }, clean: { type: 'boolean' }, files: { type: 'array', items: gitFileChangeResponseSchema }, latestCommit: gitCommitResponseSchema, recentCommits: { type: 'array', items: gitCommitResponseSchema }, stashes: { type: 'array', items: gitStashEntryResponseSchema },
  },
} as const;

export const projectDatabaseEnvironmentResponseSchema = {
  type: 'object', additionalProperties: false,

  required: ['id', 'environment', 'driver', 'passwordConfigured', 'source', 'sourceDetail', 'reachability', 'startAvailable'],
    
  properties: {
    id: { type: 'string' }, environment: { type: 'string' }, driver: { type: 'string' },
    host: { type: 'string' }, port: { type: 'integer' }, database: { type: 'string' }, username: { type: 'string' },
    passwordConfigured: { type: 'boolean' }, maskedUrl: { type: 'string' },
    source: { type: 'string', enum: ['rails-database-yml', 'dotenv', 'prisma', 'knex'] },
    sourceDetail: { type: 'string' }, reachability: { type: 'string', enum: ['reachable', 'unreachable', 'unknown'] },

    startAvailable: { type: 'boolean' },

  },
} as const;

export const projectDatabaseOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'environments', 'page', 'pageSize', 'total'],
  properties: {
    supported: { type: 'boolean' }, environments: { type: 'array', items: projectDatabaseEnvironmentResponseSchema },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' },
  },
} as const;

const activityStatusEnum = ['running', 'succeeded', 'failed', 'cancelled', 'unknown'] as const;

const scriptActivityResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'label', 'origin', 'status', 'startedAt', 'reference'],
  properties: {
    id: { type: 'string' }, projectId: { type: 'string' }, workspaceId: { type: 'string' },
    label: { type: 'string' }, origin: { type: 'string', enum: ['script'] },
    status: { type: 'string', enum: activityStatusEnum },
    startedAt: { type: 'string' }, finishedAt: { type: 'string' },
    reference: {
      type: 'object', additionalProperties: false, required: ['executionId', 'actionId'],
      properties: { executionId: { type: 'string' }, actionId: { type: 'string' } },
    },
  },
} as const;

const processActivityResponseSchema = (origin: 'test' | 'server') => ({
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'label', 'origin', 'status', 'startedAt', 'reference'],
  properties: {
    id: { type: 'string' }, projectId: { type: 'string' }, workspaceId: { type: 'string' },
    label: { type: 'string' }, origin: { type: 'string', enum: [origin] },
    status: { type: 'string', enum: activityStatusEnum },
    startedAt: { type: 'string' }, finishedAt: { type: 'string' },
    reference: {
      type: 'object', additionalProperties: false, required: ['processId'],
      properties: { processId: { type: 'string' } },
    },
  },
}) as const;

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
    operation: { type: 'string', enum: ['create-branch', 'switch-branch', 'pull', 'push', 'commit', 'stash-push', 'stash-pop'] },
    target: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const gitBranchMutationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['branch'],
  properties: { branch: { type: 'string' } },
} as const;

export const gitCommitMutationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['hash', 'shortHash', 'subject'],
  properties: { hash: { type: 'string' }, shortHash: { type: 'string' }, subject: { type: 'string' } },
} as const;

export const gitStashPushResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['stash'],
  properties: { stash: gitStashEntryResponseSchema },
} as const;

export const gitStashPopResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['popped'],
  properties: { popped: gitStashEntryResponseSchema },
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

export const activityListResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: {
      type: 'array',
      items: {
        anyOf: [
          scriptActivityResponseSchema,
          processActivityResponseSchema('test'),
          processActivityResponseSchema('server'),
        ],
      },
    },
    page: { type: 'integer' }, pageSize: { type: 'integer' },
    total: { type: 'integer' }, totalPages: { type: 'integer' },
  },
} as const;
