import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { WebSocket } from 'ws';

import type {
  AgentCapability,
  AgentProviderId,
} from '@dev-dashboard/agent-runtime';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  AgentRuntimeApiServiceError,
  type AgentRuntimeApiServicePort,
} from '../services/agent-runtime-api-service.js';
import type { AgentRuntimeRealtimeService } from '../services/agent-runtime-realtime-service.js';

interface Options extends FastifyPluginOptions {
  agentRuntimeApiService: AgentRuntimeApiServicePort;
  agentRuntimeRealtimeService: Pick<AgentRuntimeRealtimeService, 'attach'>;
}

interface ProjectParams {
  projectId: string;
}

interface TaskParams extends ProjectParams {
  taskId: string;
}

interface CheckpointParams extends TaskParams {
  checkpointId: string;
}

interface CreateTaskBody {
  summary: string;
  environmentInstanceId?: string;
  taskContextId?: string;
  requestedCapabilities?: AgentCapability[];
}

interface ExecuteBody {
  providerId?: AgentProviderId;
  attachmentIds?: string[];
}

interface ConversationTurnBody {
  id: string;
  content: string;
  providerId?: AgentProviderId;
  attachmentIds?: string[];
}

interface AttachmentBody {
  filename: string;
  mediaType:
    | 'text/plain'
    | 'text/markdown'
    | 'application/json'
    | 'image/png'
    | 'image/jpeg'
    | 'image/webp';
  contentBase64: string;
}

interface AdoptBacklogBody {
  issueNumber?: number;
  environmentInstanceId?: string;
  requestedCapabilities?: AgentCapability[];
}

interface AdoptGitRefBody {
  branch: string;
  commitHash: string;
  confirmed: boolean;
}

interface UsageQuery {
  observedFrom?: string;
  observedTo?: string;
}

interface ProviderPreferenceBody {
  preferredProviderId: 'codex' | 'claude-code';
  fallbackOrder?: Array<'codex' | 'claude-code'>;
}

interface IntegrationQuery {
  providerId: 'codex' | 'claude-code' | 'chatgpt-browser';
  environmentInstanceId?: string;
}

interface InspectIntegrationQuery extends IntegrationQuery {
  kind:
    'mcp-server' | 'skill' | 'plugin' | 'marketplace' | 'browser-capability';
  name: string;
}

interface InstallIntegrationBody {
  providerId: 'codex' | 'claude-code' | 'chatgpt-browser';
  environmentInstanceId?: string;
  kind:
    'mcp-server' | 'skill' | 'plugin' | 'marketplace' | 'browser-capability';
  name: string;
  scope: 'user' | 'project' | 'local' | 'session';
  confirmed: boolean;
  marketplace?: string;
  url?: string;
}

interface AuthenticateIntegrationBody {
  providerId: 'codex' | 'claude-code' | 'chatgpt-browser';
  environmentInstanceId?: string;
  kind:
    'mcp-server' | 'skill' | 'plugin' | 'marketplace' | 'browser-capability';
  name: string;
  scope?: 'user' | 'project' | 'local' | 'managed' | 'session';
}

interface SetIntegrationEnabledBody {
  providerId: 'codex' | 'claude-code' | 'chatgpt-browser';
  environmentInstanceId?: string;
  kind:
    'mcp-server' | 'skill' | 'plugin' | 'marketplace' | 'browser-capability';
  name: string;
  marketplace?: string;
  scope: 'user' | 'project' | 'local' | 'managed' | 'session';
  enabled: boolean;
}

interface UninstallIntegrationBody {
  providerId: 'codex' | 'claude-code' | 'chatgpt-browser';
  environmentInstanceId?: string;
  kind:
    'mcp-server' | 'skill' | 'plugin' | 'marketplace' | 'browser-capability';
  name: string;
  marketplace?: string;
  scope: 'user' | 'project' | 'local' | 'managed' | 'session';
  confirmed: boolean;
}

interface AuthorizationBody {
  capability: AgentCapability;
  granted: boolean;
}

interface BudgetBody {
  maxTotalTokens?: number;
  maxEstimatedCostUsd?: number;
  mode?: 'soft' | 'hard';
}

interface CheckpointResolutionBody {
  decision: 'approved' | 'rejected';
  instruction?: string;
}

interface CompleteTaskBody {
  confirmed: boolean;
}

interface CleanupTaskBody {
  confirmationToken: string;
}

const providerIds = [
  'automatic',
  'codex',
  'claude-code',
  'chatgpt-browser',
] as const;
const concreteProviderIds = [
  'codex',
  'claude-code',
  'chatgpt-browser',
] as const;
const capabilities = [
  'workspace:write',
  'git:commit',
  'git:push',
  'github:pull-request',
  'github:merge',
  'deployment:run',
  'release:run',
] as const;
const taskStates = [
  'queued',
  'running',
  'checkpoint',
  'review',
  'blocked',
  'failed',
  'completed',
  'cancelled',
] as const;

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const checkpointParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId', 'checkpointId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 256 },
    taskId: { type: 'string', minLength: 1, maxLength: 256 },
    checkpointId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const taskParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 256 },
    taskId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const createTaskBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 4000 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    taskContextId: { type: 'string', minLength: 1, maxLength: 256 },
    requestedCapabilities: {
      type: 'array',
      uniqueItems: true,
      maxItems: capabilities.length,
      items: { type: 'string', enum: [...capabilities] },
    },
  },
} as const;

const adoptBacklogBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    issueNumber: { type: 'integer', minimum: 1 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    requestedCapabilities: {
      type: 'array',
      uniqueItems: true,
      maxItems: capabilities.length,
      items: { type: 'string', enum: [...capabilities] },
    },
  },
} as const;

const adoptGitRefBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'commitHash', 'confirmed'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 256 },
    commitHash: {
      type: 'string',
      pattern: '^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$',
    },
    confirmed: { type: 'boolean' },
  },
} as const;

const providerPreferenceBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['preferredProviderId'],
  properties: {
    preferredProviderId: {
      type: 'string',
      enum: ['codex', 'claude-code'],
    },
    fallbackOrder: {
      type: 'array',
      uniqueItems: true,
      maxItems: 2,
      items: {
        type: 'string',
        enum: ['codex', 'claude-code'],
      },
    },
  },
} as const;

const providerPreferenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'preferredProviderId', 'fallbackOrder', 'updatedAt'],
  properties: {
    projectId: { type: 'string' },
    preferredProviderId: {
      type: 'string',
      enum: ['codex', 'claude-code'],
    },
    fallbackOrder: {
      type: 'array',
      uniqueItems: true,
      maxItems: 2,
      items: {
        type: 'string',
        enum: ['codex', 'claude-code'],
      },
    },
    updatedAt: { type: 'string' },
  },
} as const;

const usageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observedFrom: { type: 'string', format: 'date-time' },
    observedTo: { type: 'string', format: 'date-time' },
  },
} as const;

const integrationQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
  },
} as const;

const inspectIntegrationQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'kind', 'name'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const installIntegrationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'kind', 'name', 'scope', 'confirmed'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    marketplace: { type: 'string', minLength: 1, maxLength: 128 },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
    confirmed: { type: 'boolean' },
    url: { type: 'string', minLength: 1, maxLength: 2048 },
  },
} as const;

const authenticateIntegrationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'kind', 'name'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
  },
} as const;

const setIntegrationEnabledBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'kind', 'name', 'scope', 'enabled'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    marketplace: { type: 'string', minLength: 1, maxLength: 128 },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
    enabled: { type: 'boolean' },
  },
} as const;

const uninstallIntegrationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'kind', 'name', 'scope', 'confirmed'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    marketplace: { type: 'string', minLength: 1, maxLength: 128 },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
    confirmed: { type: 'boolean' },
  },
} as const;

const integrationAuthenticationHandoffSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'providerId',
    'kind',
    'name',
    'mode',
    'program',
    'args',
    'requiresInteractiveTerminal',
  ],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string', maxLength: 128 },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
    mode: { type: 'string', enum: ['interactive-terminal'] },
    program: { type: 'string', enum: ['claude', 'codex'] },
    args: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 256 },
    },
    requiresInteractiveTerminal: { type: 'boolean' },
  },
} as const;

const integrationUninstallResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'kind', 'name', 'scope', 'dataPreserved'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string' },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
    marketplace: { type: 'string', maxLength: 128 },
    dataPreserved: { type: 'boolean' },
  },
} as const;

const integrationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'providerId', 'kind', 'name'],
  properties: {
    id: { type: 'string' },
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    name: { type: 'string' },
    scope: {
      type: 'string',
      enum: ['user', 'project', 'local', 'managed', 'session'],
    },
    origin: {
      type: 'string',
      enum: [
        'codex-global-config',
        'claude-mcp-config',
        'claude-plugin-inventory',
        'claude-plugin-catalog',
        'claude-marketplace-inventory',
        'browser-local-allowlist',
      ],
    },
    version: { type: 'string', maxLength: 128 },
    marketplace: { type: 'string', maxLength: 128 },
    marketplaceSource: {
      type: 'string',
      enum: ['github', 'git', 'url', 'local', 'claude-ai', 'unknown'],
    },
    enabled: { type: 'boolean' },
    authStatus: {
      type: 'string',
      enum: ['authenticated', 'unauthenticated', 'unsupported', 'unknown'],
    },
  },
} as const;

const integrationIssueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: ['invalid-entry', 'source-unavailable'],
    },
    message: { type: 'string' },
    index: { type: 'integer', minimum: 0 },
    source: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
  },
} as const;

const integrationDetailsSchema = {
  ...integrationSchema,
  properties: {
    ...integrationSchema.properties,
    transportType: {
      type: 'string',
      enum: ['stdio', 'streamable-http'],
    },
    enabledTools: {
      type: 'array',
      maxItems: 500,
      items: { type: 'string' },
    },
    disabledTools: {
      type: 'array',
      maxItems: 500,
      items: { type: 'string' },
    },
    startupTimeoutSec: { type: 'number', minimum: 0 },
    toolTimeoutSec: { type: 'number', minimum: 0 },
  },
} as const;

const executeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    providerId: { type: 'string', enum: [...providerIds] },
    attachmentIds: {
      type: 'array',
      uniqueItems: true,
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 256 },
    },
  },
} as const;

const conversationTurnBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'content'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 256 },
    content: { type: 'string', minLength: 1, maxLength: 16000 },
    providerId: { type: 'string', enum: [...providerIds] },
    attachmentIds: {
      type: 'array',
      uniqueItems: true,
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 256 },
    },
  },
} as const;

const attachmentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['filename', 'mediaType', 'contentBase64'],
  properties: {
    filename: { type: 'string', minLength: 1, maxLength: 180 },
    mediaType: {
      type: 'string',
      enum: [
        'text/plain',
        'text/markdown',
        'application/json',
        'image/png',
        'image/jpeg',
        'image/webp',
      ],
    },
    contentBase64: { type: 'string', minLength: 1, maxLength: 1400000 },
  },
} as const;

const attachmentSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'taskId',
    'filename',
    'mediaType',
    'byteSize',
    'sha256',
    'source',
    'createdAt',
  ],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    filename: { type: 'string' },
    mediaType: { type: 'string' },
    byteSize: { type: 'integer', minimum: 1 },
    sha256: { type: 'string' },
    source: { type: 'string', enum: ['user-upload'] },
    createdAt: { type: 'string' },
    textPreview: { type: 'string' },
  },
} as const;

const conversationTurnSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'role', 'content', 'createdAt'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    role: { type: 'string', enum: ['user', 'agent'] },
    content: { type: 'string' },
    createdAt: { type: 'string' },
    executionId: { type: 'string' },
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    attachmentIds: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
  },
} as const;

const budgetBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    maxTotalTokens: { type: 'integer', minimum: 1 },
    maxEstimatedCostUsd: { type: 'number', exclusiveMinimum: 0 },
    mode: { type: 'string', enum: ['soft', 'hard'] },
  },
} as const;

const authorizationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['capability', 'granted'],
  properties: {
    capability: { type: 'string', enum: [...capabilities] },
    granted: { type: 'boolean' },
  },
} as const;

const checkpointResolutionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decision'],
  properties: {
    decision: { type: 'string', enum: ['approved', 'rejected'] },
    instruction: { type: 'string', minLength: 1, maxLength: 4000 },
  },
} as const;

const completeTaskBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmed'],
  properties: {
    confirmed: { type: 'boolean', enum: [true] },
  },
} as const;

const cleanupTaskBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmationToken'],
  properties: {
    confirmationToken: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const checkpointSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'taskId',
    'status',
    'summary',
    'requiredCapabilities',
    'createdAt',
  ],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    status: {
      type: 'string',
      enum: ['pending', 'approved', 'rejected'],
    },
    summary: { type: 'string' },
    requiredCapabilities: {
      type: 'array',
      items: { type: 'string', enum: [...capabilities] },
    },
    createdAt: { type: 'string' },
    resolvedAt: { type: 'string' },
    continuationInstruction: { type: 'string' },
  },
} as const;

const authorizationScopeSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'projectId', 'environmentInstanceId'],
      properties: {
        kind: { type: 'string', enum: ['environment'] },
        projectId: { type: 'string' },
        environmentInstanceId: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'projectId', 'branch'],
      properties: {
        kind: { type: 'string', enum: ['branch'] },
        projectId: { type: 'string' },
        branch: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'repository', 'branch'],
      properties: {
        kind: { type: 'string', enum: ['repository-branch'] },
        repository: { type: 'string' },
        branch: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'repository', 'number'],
      properties: {
        kind: { type: 'string', enum: ['pull-request'] },
        repository: { type: 'string' },
        number: { type: 'integer', minimum: 1 },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'projectId', 'target'],
      properties: {
        kind: { type: 'string', enum: ['release-target'] },
        projectId: { type: 'string' },
        target: { type: 'string' },
      },
    },
  ],
} as const;

const authorizationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId', 'capability', 'granted', 'observedAt'],
  properties: {
    taskId: { type: 'string' },
    capability: { type: 'string', enum: [...capabilities] },
    granted: { type: 'boolean' },
    observedAt: { type: 'string' },
    scope: authorizationScopeSchema,
  },
} as const;

const eventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'type', 'summary', 'occurredAt'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    type: {
      type: 'string',
      enum: [
        'task-state',
        'execution-state',
        'checkpoint',
        'authorization',
        'evidence',
      ],
    },
    summary: { type: 'string' },
    occurredAt: { type: 'string' },
  },
} as const;

const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'kind', 'summary', 'observedAt'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    kind: {
      type: 'string',
      enum: [
        'diff',
        'test',
        'log',
        'commit',
        'pull-request',
        'readiness',
        'other',
      ],
    },
    summary: { type: 'string' },
    reference: { type: 'string' },
    observedAt: { type: 'string' },
  },
} as const;

const agentTaskCleanupSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: [
        'not-applicable',
        'eligible',
        'blocked',
        'already-cleaned',
        'removed',
        'cleanup-required',
        'failed',
        'unverified',
      ],
    },
    worktreeId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    confirmationToken: { type: 'string' },
    expiresAt: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const pullRequestFeedbackSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'observedAt',
    'evidence',
    'newEvidenceCount',
    'automaticContinuation',
  ],
  properties: {
    status: {
      type: 'string',
      enum: ['no-pull-request', 'ready', 'attention', 'unavailable'],
    },
    observedAt: { type: 'string' },
    evidence: {
      type: 'array',
      maxItems: 12,
      items: evidenceSchema,
    },
    newEvidenceCount: { type: 'integer', minimum: 0 },
    automaticContinuation: { type: 'boolean', enum: [false] },
    pullRequest: {
      type: 'object',
      additionalProperties: false,
      required: ['number', 'url'],
      properties: {
        number: { type: 'integer', minimum: 1 },
        url: { type: 'string' },
        headSha: { type: 'string' },
        ciStatus: {
          type: 'string',
          enum: ['success', 'pending', 'failure', 'unknown'],
        },
        reviewState: {
          type: 'string',
          enum: ['approved', 'changes-requested', 'review-required', 'unknown'],
        },
        unresolvedConversationsCount: { type: 'integer', minimum: 0 },
        remoteStatus: {
          type: 'string',
          enum: ['available', 'unauthenticated', 'rate-limited', 'unavailable'],
        },
      },
    },
  },
} as const;

const taskSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'environmentInstanceId',
    'state',
    'summary',
    'requestedCapabilities',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    taskContextId: { type: 'string' },
    state: { type: 'string', enum: [...taskStates] },
    summary: { type: 'string' },
    continuationInstruction: { type: 'string' },
    adoptedGitRef: {
      type: 'object',
      additionalProperties: false,
      required: ['branch', 'commitHash', 'verifiedAt'],
      properties: {
        branch: { type: 'string' },
        commitHash: { type: 'string' },
        verifiedAt: { type: 'string' },
      },
    },
    requestedCapabilities: {
      type: 'array',
      items: { type: 'string', enum: [...capabilities] },
    },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const taskRecordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'version'],
  properties: {
    task: taskSchema,
    version: { type: 'integer', minimum: 1 },
  },
} as const;

const agentTaskCompletionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'handoffEvidence', 'cleanup'],
  properties: {
    task: taskRecordSchema,
    handoffEvidence: evidenceSchema,
    cleanup: agentTaskCleanupSchema,
  },
} as const;

const backlogIssueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['repository', 'number', 'title', 'labels'],
  properties: {
    repository: { type: 'string' },
    number: { type: 'integer', minimum: 1 },
    title: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' }, maxItems: 100 },
  },
} as const;

const backlogAdoptionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'source', 'candidates', 'reused'],
  properties: {
    status: { type: 'string', enum: ['adopted', 'ambiguous'] },
    source: { type: 'string' },
    issue: backlogIssueSchema,
    candidates: {
      type: 'array',
      maxItems: 10,
      items: backlogIssueSchema,
    },
    task: taskRecordSchema,
    reused: { type: 'boolean' },
  },
} as const;

const usageSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['executionCount'],
  properties: {
    executionCount: { type: 'integer', minimum: 0 },
    inputTokens: { type: 'integer', minimum: 0 },
    cachedInputTokens: { type: 'integer', minimum: 0 },
    cacheWriteInputTokens: { type: 'integer', minimum: 0 },
    outputTokens: { type: 'integer', minimum: 0 },
    reasoningTokens: { type: 'integer', minimum: 0 },
    totalTokens: { type: 'integer', minimum: 0 },
    reportedCostUsd: { type: 'number', minimum: 0 },
    estimatedCostUsd: { type: 'number', minimum: 0 },
    durationMs: { type: 'integer', minimum: 0 },
  },
} as const;

const usageOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'byProvider'],
  properties: {
    total: usageSummarySchema,
    byProvider: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        concreteProviderIds.map((providerId) => [
          providerId,
          usageSummarySchema,
        ]),
      ),
    },
  },
} as const;

const budgetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId', 'updatedAt'],
  properties: {
    projectId: { type: 'string' },
    taskId: { type: 'string' },
    maxTotalTokens: { type: 'integer', minimum: 1 },
    maxEstimatedCostUsd: { type: 'number', exclusiveMinimum: 0 },
    mode: { type: 'string', enum: ['soft', 'hard'] },
    updatedAt: { type: 'string' },
  },
} as const;

const budgetAlertSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'observed', 'threshold'],
  properties: {
    kind: {
      type: 'string',
      enum: ['total-tokens', 'estimated-cost-usd'],
    },
    observed: { type: 'number', minimum: 0 },
    threshold: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

const budgetOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['budget', 'usage', 'alerts', 'blocking'],
  properties: {
    budget: {
      anyOf: [budgetSchema, { type: 'null' }],
    },
    usage: usageSummarySchema,
    alerts: {
      type: 'array',
      maxItems: 2,
      items: budgetAlertSchema,
    },
    blocking: { type: 'boolean' },
  },
} as const;

const providerStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'availability', 'observedAt'],
  properties: {
    providerId: { type: 'string', enum: [...providerIds] },
    availability: {
      type: 'string',
      enum: ['available', 'degraded', 'unavailable'],
    },
    observedAt: { type: 'string' },
    version: { type: 'string' },
    selectedProviderId: {
      type: 'string',
      enum: [...concreteProviderIds],
    },
    reason: { type: 'string' },
    diagnostic: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'ready',
            'command-unavailable',
            'version-unsupported',
            'authentication-required',
            'preflight-timeout',
            'runtime-failed',
            'bridge-token-missing',
            'bridge-unavailable',
            'bridge-unhealthy',
            'bridge-paused',
            'browser-extension-unavailable',
            'browser-extension-stale',
            'browser-session-unavailable',
            'automatic-unavailable',
          ],
        },
        evidence: { type: 'string', maxLength: 512 },
      },
    },
    quota: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'source'],
      properties: {
        status: { type: 'string', enum: ['available', 'unavailable'] },
        label: { type: 'string' },
        used: { type: 'number', minimum: 0 },
        remaining: { type: 'number', minimum: 0 },
        resetAt: { type: 'string' },
        source: { type: 'string', enum: ['provider', 'unavailable'] },
        reason: { type: 'string' },
      },
    },
  },
} as const;

const integrationCapabilitySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'scopes', 'operations', 'availability'],
  properties: {
    kind: {
      type: 'string',
      enum: [
        'mcp-server',
        'skill',
        'plugin',
        'marketplace',
        'browser-capability',
      ],
    },
    scopes: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'string',
        enum: ['user', 'project', 'local', 'managed', 'session'],
      },
    },
    operations: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'string',
        enum: [
          'list',
          'inspect',
          'install',
          'enable',
          'disable',
          'uninstall',
          'authenticate',
        ],
      },
    },
    availability: {
      type: 'string',
      enum: ['supported', 'unavailable'],
    },
    reason: { type: 'string' },
  },
} as const;

const integrationProviderCapabilitiesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'integrations'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    integrations: {
      type: 'array',
      items: integrationCapabilitySchema,
    },
  },
} as const;

const runtimeStateSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'taskId',
    'projectId',
    'canonicalVersion',
    'state',
    'attempts',
    'updatedAt',
  ],
  properties: {
    taskId: { type: 'string' },
    projectId: { type: 'string' },
    canonicalVersion: { type: 'integer', minimum: 0 },
    state: { type: 'string', enum: ['idle', 'running', 'interrupted'] },
    executionId: { type: 'string' },
    processId: { type: 'integer', minimum: 1 },
    attempts: { type: 'integer', minimum: 0 },
    startedAt: { type: 'string' },
    updatedAt: { type: 'string' },
    lastReason: {
      type: 'string',
      enum: [
        'process-interrupted',
        'canonical-task-advanced',
        'operator-recovered',
      ],
    },
  },
} as const;

const ownershipSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId', 'executionId'],
  properties: {
    projectId: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
  },
} as const;

const statusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'runtime'],
  properties: {
    task: taskRecordSchema,
    runtime: runtimeStateSchema,
    activeExecution: ownershipSchema,
  },
} as const;

const failureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'code', 'message'],
  properties: {
    kind: { type: 'string', enum: ['known', 'ambiguous'] },
    code: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

const executionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'projectId', 'providerId', 'state'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    requestedProviderId: { type: 'string', enum: [...providerIds] },
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    state: {
      type: 'string',
      enum: [
        'queued',
        'running',
        'checkpoint',
        'succeeded',
        'failed',
        'cancelled',
        'unknown',
      ],
    },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    failure: failureSchema,
  },
} as const;

const providerResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'outcome', 'summary'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    outcome: {
      type: 'string',
      enum: ['checkpoint', 'succeeded', 'failed', 'cancelled', 'unknown'],
    },
    summary: { type: 'string' },
    responseText: { type: 'string', maxLength: 16000 },
    failure: failureSchema,
    evidence: {
      type: 'array',
      maxItems: 100,
      items: evidenceSchema,
    },
  },
} as const;

function mapAgentError(error: unknown): unknown {
  if (!(error instanceof AgentRuntimeApiServiceError)) return error;

  switch (error.code) {
    case 'AGENT_API_PROJECT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_ENVIRONMENT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_TASK_CONTEXT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_BACKLOG_ISSUE_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_TASK_NOT_FOUND':
    case 'AGENT_WORKFLOW_TASK_NOT_FOUND':
    case 'AGENT_WORKFLOW_TASK_PROJECT_MISMATCH':
      return new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Agent task was not found.',
      });
    case 'AGENT_API_INVALID_REQUEST':
    case 'AGENT_WORKFLOW_PROVIDER_NOT_FOUND':
    case 'AGENT_WORKFLOW_AUTHORIZATION_INVALID':
    case 'AGENT_WORKFLOW_CHECKPOINT_INVALID':
      return new ApiError({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_EVIDENCE_PERSIST_FAILED':
    case 'AGENT_WORKFLOW_CONVERSATION_PERSIST_FAILED':
      return new ApiError({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: error.message,
      });
    case 'AGENT_API_INTEGRATION_DISCOVERY_FAILED':
    case 'AGENT_WORKFLOW_PROVIDER_FAILED':
      return new ApiError({
        statusCode: 502,
        code: 'INTERNAL_ERROR',
        message: error.message,
      });
    case 'AGENT_API_BACKLOG_UNAVAILABLE':
    case 'AGENT_API_INTEGRATION_PROVIDER_UNAVAILABLE':
    case 'AGENT_WORKFLOW_CONVERSATION_UNAVAILABLE':
    case 'AGENT_WORKFLOW_CLOSING':
      return new ApiError({
        statusCode: 503,
        code: 'INTERNAL_ERROR',
        message: error.message,
      });
    case 'AGENT_API_BUDGET_EXCEEDED':
    case 'AGENT_API_EXECUTION_CONFLICT':
    case 'AGENT_API_WORKSPACE_PROVISIONING_FAILED':
    case 'AGENT_WORKFLOW_TASK_NOT_RUNNABLE':
    case 'AGENT_WORKFLOW_CANCEL_NOT_ACTIVE':
    case 'AGENT_WORKFLOW_CANCEL_OWNERSHIP_MISMATCH':
    case 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED':
    case 'AGENT_WORKFLOW_ADOPTION_NOT_ALLOWED':
    case 'AGENT_WORKFLOW_ADOPTED_REF_MISMATCH':
    case 'AGENT_WORKFLOW_CHECKPOINT_NOT_PENDING':
    case 'AGENT_WORKFLOW_TURN_ALREADY_SUBMITTED':
      return new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: error.message,
      });
  }

  return error;
}

async function withAgentErrors<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapAgentError(error);
  }
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export const agentRuntimeRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/agent/providers',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['providers'],
            properties: {
              providers: { type: 'array', items: providerStatusSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () =>
      withAgentErrors(async () => ({
        providers: await options.agentRuntimeApiService.listProviders(),
      })),
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/agent/provider-preference',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['preference'],
            properties: {
              preference: {
                anyOf: [providerPreferenceSchema, { type: 'null' }],
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        preference: await options.agentRuntimeApiService.getProviderPreference(
          request.params.projectId,
        ),
      })),
  );

  app.put<{ Params: ProjectParams; Body: ProviderPreferenceBody }>(
    '/projects/:projectId/agent/provider-preference',
    {
      schema: {
        params: projectParamsSchema,
        body: providerPreferenceBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['preference'],
            properties: {
              preference: providerPreferenceSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        preference: await options.agentRuntimeApiService.setProviderPreference(
          request.params.projectId,
          {
            preferredProviderId: request.body.preferredProviderId,
            ...(request.body.fallbackOrder
              ? { fallbackOrder: request.body.fallbackOrder }
              : {}),
          },
        ),
      })),
  );

  app.delete<{ Params: ProjectParams }>(
    '/projects/:projectId/agent/provider-preference',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          204: { type: 'null' },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      await withAgentErrors(() =>
        options.agentRuntimeApiService.clearProviderPreference(
          request.params.projectId,
        ),
      );
      return reply.code(204).send();
    },
  );

  app.get(
    '/agent/integrations/capabilities',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['providers'],
            properties: {
              providers: {
                type: 'array',
                items: integrationProviderCapabilitiesSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      providers: options.agentRuntimeApiService.listIntegrationCapabilities(),
    }),
  );

  app.get<{ Params: ProjectParams; Querystring: IntegrationQuery }>(
    '/projects/:projectId/agent/integrations',
    {
      schema: {
        params: projectParamsSchema,
        querystring: integrationQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['integrations', 'issues'],
            properties: {
              integrations: {
                type: 'array',
                items: integrationSchema,
              },
              issues: {
                type: 'array',
                items: integrationIssueSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.listIntegrations(
          request.params.projectId,
          request.query.providerId,
          request.query.environmentInstanceId,
        ),
      ),
  );

  app.get<{ Params: ProjectParams; Querystring: InspectIntegrationQuery }>(
    '/projects/:projectId/agent/integrations/inspect',
    {
      schema: {
        params: projectParamsSchema,
        querystring: inspectIntegrationQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['integration'],
            properties: {
              integration: integrationDetailsSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        integration: await options.agentRuntimeApiService.inspectIntegration(
          request.params.projectId,
          request.query.providerId,
          {
            kind: request.query.kind,
            name: request.query.name,
          },
          request.query.environmentInstanceId,
        ),
      })),
  );

  app.post<{ Params: ProjectParams; Body: InstallIntegrationBody }>(
    '/projects/:projectId/agent/integrations',
    {
      schema: {
        params: projectParamsSchema,
        body: installIntegrationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['integration'],
            properties: {
              integration: integrationSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        integration: await options.agentRuntimeApiService.installIntegration(
          request.params.projectId,
          request.body.providerId,
          {
            kind: request.body.kind,
            name: request.body.name,
            scope: request.body.scope,
            confirmed: request.body.confirmed,
            ...(request.body.marketplace
              ? { marketplace: request.body.marketplace }
              : {}),
            ...(request.body.url ? { url: request.body.url } : {}),
          },
          request.body.environmentInstanceId,
        ),
      })),
  );

  app.post<{ Params: ProjectParams; Body: AuthenticateIntegrationBody }>(
    '/projects/:projectId/agent/integrations/authentication',
    {
      schema: {
        params: projectParamsSchema,
        body: authenticateIntegrationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['handoff'],
            properties: {
              handoff: integrationAuthenticationHandoffSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        handoff:
          await options.agentRuntimeApiService.prepareIntegrationAuthentication(
            request.params.projectId,
            request.body.providerId,
            {
              kind: request.body.kind,
              name: request.body.name,
              ...(request.body.scope ? { scope: request.body.scope } : {}),
            },
            request.body.environmentInstanceId,
          ),
      })),
  );

  app.patch<{ Params: ProjectParams; Body: SetIntegrationEnabledBody }>(
    '/projects/:projectId/agent/integrations/enabled',
    {
      schema: {
        params: projectParamsSchema,
        body: setIntegrationEnabledBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['integration'],
            properties: {
              integration: integrationSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        integration: await options.agentRuntimeApiService.setIntegrationEnabled(
          request.params.projectId,
          request.body.providerId,
          {
            kind: request.body.kind,
            name: request.body.name,
            ...(request.body.marketplace
              ? { marketplace: request.body.marketplace }
              : {}),
            scope: request.body.scope,
            enabled: request.body.enabled,
          },
          request.body.environmentInstanceId,
        ),
      })),
  );

  app.delete<{ Params: ProjectParams; Body: UninstallIntegrationBody }>(
    '/projects/:projectId/agent/integrations',
    {
      schema: {
        params: projectParamsSchema,
        body: uninstallIntegrationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: integrationUninstallResultSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        result: await options.agentRuntimeApiService.uninstallIntegration(
          request.params.projectId,
          request.body.providerId,
          {
            kind: request.body.kind,
            name: request.body.name,
            ...(request.body.marketplace
              ? { marketplace: request.body.marketplace }
              : {}),
            scope: request.body.scope,
            confirmed: request.body.confirmed,
          },
          request.body.environmentInstanceId,
        ),
      })),
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/agent/tasks',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['tasks'],
            properties: {
              tasks: { type: 'array', items: taskRecordSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        tasks: await options.agentRuntimeApiService.listTasks(
          request.params.projectId,
        ),
      })),
  );

  app.post<{ Params: ProjectParams; Body: AdoptBacklogBody }>(
    '/projects/:projectId/agent/adopt-backlog',
    {
      schema: {
        params: projectParamsSchema,
        body: adoptBacklogBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: backlogAdoptionResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => {
        const adoptBacklog = options.agentRuntimeApiService.adoptBacklog;
        if (!adoptBacklog) {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_BACKLOG_UNAVAILABLE',
            'GitHub backlog adoption is unavailable.',
          );
        }
        return {
          result: await adoptBacklog.call(
            options.agentRuntimeApiService,
            request.params.projectId,
            request.body ?? {},
          ),
        };
      }),
  );

  app.post<{ Params: ProjectParams; Body: CreateTaskBody }>(
    '/projects/:projectId/agent/tasks',
    {
      schema: {
        params: projectParamsSchema,
        body: createTaskBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const task = await withAgentErrors(() =>
        options.agentRuntimeApiService.createTask(
          request.params.projectId,
          request.body,
        ),
      );
      return reply.code(201).send({ task });
    },
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        task: await options.agentRuntimeApiService.getTask(
          request.params.projectId,
          request.params.taskId,
        ),
      })),
  );

  app.post<{ Params: TaskParams; Body: AdoptGitRefBody }>(
    '/projects/:projectId/agent/tasks/:taskId/adopt-ref',
    {
      schema: {
        params: taskParamsSchema,
        body: adoptGitRefBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        task: await options.agentRuntimeApiService.adoptGitRef(
          request.params.projectId,
          request.params.taskId,
          {
            branch: request.body.branch,
            commitHash: request.body.commitHash,
            confirmed: request.body.confirmed,
          },
        ),
      })),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/status',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.status(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/conversation',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['turns'],
            properties: {
              turns: {
                type: 'array',
                maxItems: 2000,
                items: conversationTurnSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        turns: await options.agentRuntimeApiService.conversation(
          request.params.projectId,
          request.params.taskId,
        ),
      })),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/attachments',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['attachments'],
            properties: {
              attachments: {
                type: 'array',
                maxItems: 8,
                items: attachmentSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        attachments: await options.agentRuntimeApiService.listAttachments(
          request.params.projectId,
          request.params.taskId,
        ),
      })),
  );

  app.post<{ Params: TaskParams; Body: AttachmentBody }>(
    '/projects/:projectId/agent/tasks/:taskId/attachments',
    {
      schema: {
        params: taskParamsSchema,
        body: attachmentBodySchema,
        response: {
          201: attachmentSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const attachment = await withAgentErrors(() =>
        options.agentRuntimeApiService.createAttachment(
          request.params.projectId,
          request.params.taskId,
          request.body,
        ),
      );
      return reply.code(201).send(attachment);
    },
  );

  app.post<{ Params: TaskParams; Body: ConversationTurnBody }>(
    '/projects/:projectId/agent/tasks/:taskId/turns',
    {
      schema: {
        params: taskParamsSchema,
        body: conversationTurnBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'execution',
              'task',
              'providerResult',
              'userTurn',
              'agentTurn',
            ],
            properties: {
              execution: executionSchema,
              task: taskRecordSchema,
              providerResult: providerResultSchema,
              checkpoint: checkpointSchema,
              userTurn: conversationTurnSchema,
              agentTurn: conversationTurnSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.execute(
          request.params.projectId,
          request.params.taskId,
          request.body.providerId,
          {
            id: request.body.id,
            content: request.body.content,
            ...(request.body.attachmentIds?.length
              ? { attachmentIds: request.body.attachmentIds }
              : {}),
          },
          request.body.attachmentIds,
        ),
      ),
  );

  app.post<{ Params: TaskParams; Body: ExecuteBody }>(
    '/projects/:projectId/agent/tasks/:taskId/executions',
    {
      schema: {
        params: taskParamsSchema,
        body: executeBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['execution', 'task', 'providerResult'],
            properties: {
              execution: executionSchema,
              task: taskRecordSchema,
              providerResult: providerResultSchema,
              checkpoint: checkpointSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.execute(
          request.params.projectId,
          request.params.taskId,
          request.body?.providerId,
          undefined,
          request.body?.attachmentIds,
        ),
      ),
  );

  app.get<{ Params: ProjectParams; Querystring: UsageQuery }>(
    '/projects/:projectId/agent/usage',
    {
      schema: {
        params: projectParamsSchema,
        querystring: usageQuerySchema,
        response: {
          200: usageOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.usage(
          request.params.projectId,
          undefined,
          request.query,
        ),
      ),
  );

  app.get<{ Params: TaskParams; Querystring: UsageQuery }>(
    '/projects/:projectId/agent/tasks/:taskId/usage',
    {
      schema: {
        params: taskParamsSchema,
        querystring: usageQuerySchema,
        response: {
          200: usageOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.usage(
          request.params.projectId,
          request.params.taskId,
          request.query,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/budget',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: budgetOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.budget(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.put<{ Params: TaskParams; Body: BudgetBody }>(
    '/projects/:projectId/agent/tasks/:taskId/budget',
    {
      schema: {
        params: taskParamsSchema,
        body: budgetBodySchema,
        response: {
          200: budgetOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.setBudget(
          request.params.projectId,
          request.params.taskId,
          request.body,
        ),
      ),
  );

  app.delete<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/budget',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: budgetOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.clearBudget(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/cancel',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.cancel(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.post<{ Params: TaskParams; Body: CompleteTaskBody }>(
    '/projects/:projectId/agent/tasks/:taskId/complete',
    {
      schema: {
        params: taskParamsSchema,
        body: completeTaskBodySchema,
        response: {
          200: agentTaskCompletionSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.completeTask(
          request.params.projectId,
          request.params.taskId,
          request.body.confirmed,
        ),
      ),
  );

  app.post<{ Params: TaskParams; Body: CleanupTaskBody }>(
    '/projects/:projectId/agent/tasks/:taskId/cleanup',
    {
      schema: {
        params: taskParamsSchema,
        body: cleanupTaskBodySchema,
        response: {
          200: agentTaskCleanupSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.cleanupCompletedTask(
          request.params.projectId,
          request.params.taskId,
          request.body.confirmationToken,
        ),
      ),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/pull-request-feedback/refresh',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: pullRequestFeedbackSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.refreshPullRequestFeedback(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/activity',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['authorizations', 'checkpoints', 'events', 'evidence'],
            properties: {
              authorizations: {
                type: 'array',
                maxItems: capabilities.length,
                items: authorizationSchema,
              },
              checkpoints: {
                type: 'array',
                maxItems: 200,
                items: checkpointSchema,
              },
              events: {
                type: 'array',
                maxItems: 200,
                items: eventSchema,
              },
              evidence: {
                type: 'array',
                maxItems: 100,
                items: evidenceSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.activity(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.post<{ Params: TaskParams; Body: AuthorizationBody }>(
    '/projects/:projectId/agent/tasks/:taskId/authorizations',
    {
      schema: {
        params: taskParamsSchema,
        body: authorizationBodySchema,
        response: {
          200: authorizationSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.setAuthorization(
          request.params.projectId,
          request.params.taskId,
          request.body.capability,
          request.body.granted,
        ),
      ),
  );

  app.post<{
    Params: CheckpointParams;
    Body: CheckpointResolutionBody;
  }>(
    '/projects/:projectId/agent/tasks/:taskId/checkpoints/:checkpointId/resolve',
    {
      schema: {
        params: checkpointParamsSchema,
        body: checkpointResolutionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task', 'checkpoint'],
            properties: {
              task: taskRecordSchema,
              checkpoint: checkpointSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.resolveCheckpoint(
          request.params.projectId,
          request.params.taskId,
          request.params.checkpointId,
          request.body.decision,
          request.body.instruction,
        ),
      ),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/retry',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        task: await options.agentRuntimeApiService.retry(
          request.params.projectId,
          request.params.taskId,
        ),
      })),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/recover',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.recover(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/connect',
    {
      websocket: true,
      schema: { params: taskParamsSchema },
    },
    (socket, request) => {
      let detached = false;
      const detach = () => {
        detached = true;
      };

      void options.agentRuntimeRealtimeService
        .attach(
          request.params.projectId,
          request.params.taskId,
          (snapshot) => {
            if (!detached) sendJson(socket, { type: 'update', snapshot });
          },
          () => {
            if (detached) return;
            sendJson(socket, {
              type: 'error',
              message: 'Agent realtime status is unavailable.',
            });
            socket.close(1011, 'Agent realtime unavailable');
          },
        )
        .then((attachment) => {
          if (detached) {
            attachment.detach();
            return;
          }

          sendJson(socket, { type: 'ready', snapshot: attachment.snapshot });
          const close = () => {
            detached = true;
            attachment.detach();
          };
          socket.once('close', close);
          socket.once('error', close);
        })
        .catch(() => {
          if (detached) return;
          sendJson(socket, {
            type: 'error',
            message: 'Agent task is unavailable.',
          });
          socket.close(1008, 'Agent task unavailable');
        });

      socket.once('close', detach);
      socket.once('error', detach);
    },
  );
};
