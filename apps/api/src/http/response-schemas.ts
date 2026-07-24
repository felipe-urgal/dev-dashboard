// Shared Fastify response schemas mirroring packages/contracts/src.
// Kept in one place because Project and Workspace shapes are reused by
// more than one route file (workspaces.ts scan endpoint + projects.ts).

export const workspaceResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "path", "enabled"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    path: { type: "string" },
    enabled: { type: "boolean" }
  }
} as const;

export const projectResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "path",
    "type",
    "source",
    "favorite",
    "capabilities"
  ],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    path: { type: "string" },
    type: { type: "string", enum: ["rails", "node", "unknown"] },
    source: { type: "string", enum: ["workspace", "standalone"] },
    workspaceId: { type: "string" },
    port: { type: "integer" },
    favorite: { type: "boolean" },
    capabilities: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "server",
          "git",
          "tests",
          "database",
          "scripts",
          "webpack",
          "sidekiq",
          "rake",
          "bundler"
        ]
      }
    }
  }
} as const;

export const workspaceScanWarningResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "code", "message"],
  properties: {
    path: { type: "string" },
    code: {
      type: "string",
      enum: ["UNREADABLE_DIRECTORY", "PROJECT_DETECTION_FAILED"]
    },
    message: { type: "string" }
  }
} as const;

export const managedProcessResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "projectId", "kind", "status"],
  properties: {
    id: { type: "string" },
    projectId: { type: "string" },
    workspaceId: { type: "string" },
    kind: {
      type: "string",
      enum: ["server", "webpack", "worker", "test", "script"]
    },
    status: {
      type: "string",
      enum: ["starting", "running", "stopping", "stopped", "failed"]
    },
    pid: { type: "integer" },
    port: { type: "integer" },
    command: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    cwd: { type: "string" },
    logPath: { type: "string" },
    startedAt: { type: "string" },
    stoppedAt: { type: "string" },
    exitCode: { type: "integer" }
  }
} as const;

export const nullableManagedProcessResponseSchema = {
  ...managedProcessResponseSchema,
  type: ["object", "null"]
} as const;

export const processLogSnapshotResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectId",
    "processId",
    "content",
    "sizeBytes",
    "truncated",
    "readAt"
  ],
  properties: {
    projectId: { type: "string" },
    processId: { type: "string" },
    content: { type: "string" },
    sizeBytes: { type: "integer" },
    truncated: { type: "boolean" },
    updatedAt: { type: "string" },
    readAt: { type: "string" }
  }
} as const;
