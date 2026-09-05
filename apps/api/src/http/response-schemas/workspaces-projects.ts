export const workspaceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'path', 'enabled', 'recursiveScan'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    path: { type: 'string' },
    enabled: { type: 'boolean' },
    recursiveScan: { type: 'boolean' },
  },
} as const;

const productionCommandsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['prod:status'] },
    check: { type: 'string', enum: ['prod:check'] },
    backup: { type: 'string', enum: ['prod:backup'] },
    migrate: { type: 'string', enum: ['prod:migrate'] },
    deploy: { type: 'string', enum: ['prod:deploy'] },
    verify: { type: 'string', enum: ['prod:verify'] },
    restoreCheck: { type: 'string', enum: ['prod:restore-check'] },
    rollback: { type: 'string', enum: ['prod:rollback'] },
    logs: { type: 'string', enum: ['prod:logs'] },
  },
} as const;

const productionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'enabled',
    'strategy',
    'provider',
    'branch',
    'commands',
    'policies',
  ],
  properties: {
    version: { type: 'integer', enum: [1] },
    enabled: { type: 'boolean' },
    strategy: {
      type: 'string',
      enum: ['command', 'git-managed', 'disabled'],
    },
    provider: {
      type: 'string',
      enum: ['systemd', 'docker-compose', 'vercel', 'none'],
    },
    branch: { type: 'string' },
    documentation: { type: 'string' },
    commands: productionCommandsResponseSchema,
    health: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'url'],
      properties: {
        type: { type: 'string', enum: ['http'] },
        url: { type: 'string' },
      },
    },
    external: {
      type: 'object',
      additionalProperties: false,
      required: ['project'],
      properties: {
        project: { type: 'string' },
      },
    },
    reasonCode: { type: 'string' },
    blockedBy: {
      type: 'array',
      items: { type: 'string' },
    },
    policies: {
      type: 'object',
      additionalProperties: false,
      required: ['backup', 'migrations', 'rollback'],
      properties: {
        backup: {
          type: 'string',
          enum: [
            'required-before-migration',
            'required-before-deploy',
            'external',
            'not-configured',
          ],
        },
        migrations: {
          type: 'string',
          enum: ['startup', 'before-deploy', 'not-configured'],
        },
        rollback: {
          type: 'string',
          enum: [
            'restore-backup-when-schema-changed',
            'manual-restore',
            'provider-only-when-schema-compatible',
            'not-configured',
          ],
        },
      },
    },
  },
} as const;

const productionWarningResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message', 'manifestPath'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'PRODUCTION_CONTRACT_UNREADABLE',
        'PRODUCTION_CONTRACT_INVALID_JSON',
        'PRODUCTION_CONTRACT_UNSUPPORTED_VERSION',
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
        'PRODUCTION_CONTRACT_SCRIPT_MISSING',
      ],
    },
    message: { type: 'string' },
    manifestPath: {
      type: 'string',
      enum: ['.dev-dashboard/production.json'],
    },
  },
} as const;

const projectProfileEvidenceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'source'],
  properties: {
    kind: { type: 'string', enum: ['file', 'manifest', 'config'] },
    source: { type: 'string' },
    detail: { type: 'string' },
  },
} as const;

const projectProfileCapabilityResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'provider', 'confidence', 'evidence'],
  properties: {
    id: { type: 'string' },
    provider: { type: 'string' },
    confidence: {
      type: 'string',
      enum: ['certain', 'strong', 'weak'],
    },
    evidence: {
      type: 'array',
      items: projectProfileEvidenceResponseSchema,
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

const projectProfileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['capabilities', 'diagnostics'],
  properties: {
    capabilities: {
      type: 'array',
      items: projectProfileCapabilityResponseSchema,
    },
    diagnostics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'message'],
        properties: {
          provider: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
} as const;

export const projectResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'path', 'type', 'source', 'enabled', 'capabilities'],
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
    enabled: { type: 'boolean' },
    lastAccessedAt: { type: 'string' },
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
          'docker',
          'production',
        ],
      },
    },
    profile: projectProfileResponseSchema,
    production: productionResponseSchema,
    productionWarning: productionWarningResponseSchema,
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
        'SCAN_DEPTH_LIMIT_REACHED',
        'SCAN_PROJECT_LIMIT_REACHED',
        'SCAN_TIMEOUT',
      ],
    },
    message: { type: 'string' },
  },
} as const;
