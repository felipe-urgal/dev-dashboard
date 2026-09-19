const dependencyInventoryEntryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'kind', 'declaredRange', 'resolution'],
  properties: {
    name: { type: 'string' },
    kind: { type: 'string', enum: ['dependency', 'devDependency'] },
    declaredRange: { type: 'string' },
    resolution: { type: 'string', enum: ['resolved', 'unknown'] },
    resolvedVersion: { type: 'string' },
  },
} as const;

const dependencyInventoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'projectId',
    'packageManager',
    'observedAt',
    'lockfile',
    'dependencies',
    'warnings',
  ],
  properties: {
    status: {
      type: 'string',
      enum: ['ready', 'unavailable', 'invalid'],
    },
    projectId: { type: 'string' },
    packageManager: { type: 'string', enum: ['npm'] },
    observedAt: { type: 'string' },
    lockfile: {
      type: 'string',
      enum: ['present', 'missing', 'unsupported', 'invalid'],
    },
    lockfileVersion: { type: 'integer' },
    dependencies: {
      type: 'array',
      items: dependencyInventoryEntryResponseSchema,
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

const nodeRuntimeDeclarationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'raw'],
  properties: {
    source: {
      type: 'string',
      enum: [
        '.node-version',
        '.nvmrc',
        '.tool-versions#node',
        '.tool-versions#nodejs',
      ],
    },
    raw: { type: 'string' },
    version: { type: 'string' },
  },
} as const;

const nodeRuntimeDiscoveryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'observedAt', 'declarations'],
  properties: {
    state: {
      type: 'string',
      enum: ['declared', 'missing', 'invalid', 'conflict'],
    },
    observedAt: { type: 'string' },
    declarations: {
      type: 'array',
      items: nodeRuntimeDeclarationResponseSchema,
    },
    version: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const dependencyMetadataResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'state',
    'source',
    'observedAt',
    'latestRuntimeCompatibility',
    'update',
  ],
  properties: {
    name: { type: 'string' },
    state: {
      type: 'string',
      enum: ['available', 'unavailable', 'invalid'],
    },
    source: { type: 'string', enum: ['npm-registry'] },
    observedAt: { type: 'string' },
    latestVersion: { type: 'string' },
    latestNodeEngine: { type: 'string' },
    runtimeVersion: { type: 'string' },
    latestRuntimeCompatibility: {
      type: 'string',
      enum: ['compatible', 'incompatible', 'unknown'],
    },
    update: {
      type: 'string',
      enum: ['none', 'patch', 'minor', 'major', 'unknown'],
    },
    diagnostic: { type: 'string' },
  },
} as const;

const osvAdvisoryReferenceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'modified'],
  properties: {
    id: { type: 'string' },
    modified: { type: 'string' },
  },
} as const;

const dependencyAdvisoryEvidenceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'state',
    'source',
    'observedAt',
    'advisories',
    'complete',
  ],
  properties: {
    name: { type: 'string' },
    state: {
      type: 'string',
      enum: [
        'available',
        'partial',
        'unknown-version',
        'unavailable',
        'invalid',
      ],
    },
    source: { type: 'string', enum: ['osv'] },
    observedAt: { type: 'string' },
    resolvedVersion: { type: 'string' },
    advisories: {
      type: 'array',
      items: osvAdvisoryReferenceResponseSchema,
    },
    complete: { type: 'boolean' },
    diagnostic: { type: 'string' },
  },
} as const;

export const projectDependencyHealthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['generatedAt', 'inventory', 'runtime', 'metadata', 'advisories'],
  properties: {
    generatedAt: { type: 'string' },
    inventory: dependencyInventoryResponseSchema,
    runtime: nodeRuntimeDiscoveryResponseSchema,
    metadata: {
      type: 'array',
      items: dependencyMetadataResponseSchema,
    },
    advisories: {
      type: 'array',
      items: dependencyAdvisoryEvidenceResponseSchema,
    },
  },
} as const;
