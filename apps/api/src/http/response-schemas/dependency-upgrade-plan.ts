const dependencyUpgradePlanItemResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'kind',
    'declaredRange',
    'state',
    'update',
    'affectedFiles',
    'warnings',
    'gates',
  ],
  properties: {
    name: { type: 'string' },
    kind: { type: 'string', enum: ['dependency', 'devDependency'] },
    declaredRange: { type: 'string' },
    state: {
      type: 'string',
      enum: ['upgrade', 'current', 'unknown'],
    },
    update: {
      type: 'string',
      enum: ['none', 'patch', 'minor', 'major', 'unknown'],
    },
    currentVersion: { type: 'string' },
    targetVersion: { type: 'string' },
    affectedFiles: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['package.json', 'package-lock.json'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
    gates: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'resolve-current-version',
          'refresh-metadata',
          'review-major-change',
          'verify-node-runtime',
          'update-node-runtime',
          'review-current-advisories',
          'refresh-current-advisories',
          'verify-target-advisories',
          'run-tests',
        ],
      },
    },
  },
} as const;

const dependencyUpgradePlanGroupResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'basis', 'dependencies', 'affectedFiles', 'lockstep'],
  properties: {
    id: { type: 'string' },
    basis: { type: 'string', enum: ['shared-manifest'] },
    dependencies: {
      type: 'array',
      items: { type: 'string' },
    },
    affectedFiles: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['package.json', 'package-lock.json'],
      },
    },
    lockstep: { type: 'string', enum: ['unknown'] },
  },
} as const;

export const projectDependencyUpgradePlanResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'generatedAt',
    'projectId',
    'packageManager',
    'status',
    'items',
    'groups',
    'warnings',
  ],
  properties: {
    generatedAt: { type: 'string' },
    projectId: { type: 'string' },
    packageManager: { type: 'string', enum: ['npm'] },
    status: {
      type: 'string',
      enum: ['ready', 'partial', 'unavailable'],
    },
    items: {
      type: 'array',
      items: dependencyUpgradePlanItemResponseSchema,
    },
    groups: {
      type: 'array',
      items: dependencyUpgradePlanGroupResponseSchema,
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;
