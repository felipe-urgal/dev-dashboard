import type { FastifyInstance } from 'fastify';

import { sweepStaleProcesses } from '@dev-dashboard/process-manager';

import {
  commonErrorResponseSchemas,
  logRetentionSweepResponseSchema,
  managedProcessResponseSchema,
} from '../../http/response-schemas.js';
import {
  PortInspectorService,
  type ExpectedLocalPort,
} from '../../services/port-inspector-service.js';
import type { ProcessRouteOptions } from './helpers.js';

const localPortExpectationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'projectName', 'service'],
  properties: {
    projectId: { type: 'string' },
    projectName: { type: 'string' },
    service: { type: 'string', enum: ['server'] },
  },
} as const;

const localPortEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['port', 'address', 'scope', 'state', 'conflict', 'expected'],
  properties: {
    port: {
      type: 'integer',
      minimum: 1,
      maximum: 65_535,
    },
    address: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    scope: {
      type: 'string',
      enum: ['loopback', 'all-interfaces'],
    },
    state: {
      type: 'string',
      enum: ['available', 'occupied'],
    },
    conflict: { type: 'boolean' },
    expected: {
      type: 'array',
      items: localPortExpectationSchema,
    },
    managedProcess: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'projectId', 'projectName', 'kind', 'status'],
      properties: {
        id: { type: 'string' },
        projectId: { type: 'string' },
        projectName: { type: 'string' },
        kind: {
          type: 'string',
          enum: [
            'server',
            'webpack',
            'worker',
            'test',
            'script',
            'compose-build',
          ],
        },
        status: {
          type: 'string',
          enum: ['starting', 'running', 'stopping', 'stopped', 'failed'],
        },
      },
    },
    externalProcess: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'name'],
      properties: {
        pid: { type: 'integer', minimum: 1 },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
        },
      },
    },
    suggestedPort: {
      type: 'integer',
      minimum: 1_024,
      maximum: 65_535,
    },
  },
} as const;

const localPortInspectionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['inspection'],
  properties: {
    inspection: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'platform', 'inspectedAt', 'entries', 'truncated'],
      properties: {
        status: {
          type: 'string',
          enum: ['ready', 'unsupported', 'unavailable'],
        },
        platform: {
          type: 'string',
          enum: ['linux', 'unsupported'],
        },
        inspectedAt: { type: 'string' },
        entries: {
          type: 'array',
          maxItems: 100,
          items: localPortEntrySchema,
        },
        truncated: { type: 'boolean' },
        warning: {
          type: 'string',
          maxLength: 240,
        },
      },
    },
  },
} as const;

async function expectedLocalPorts(
  options: ProcessRouteOptions,
): Promise<ExpectedLocalPort[]> {
  const projects = options.projectStore.listProjects();
  const candidates = await Promise.all(
    projects.map(async (project) => {
      try {
        const settings = await options.serverSettingsRepository.find(
          project.id,
        );
        if (settings.port === undefined) return null;

        return {
          port: settings.port,
          projectId: project.id,
          projectName: project.name,
          service: 'server' as const,
        };
      } catch {
        return null;
      }
    }),
  );

  return candidates.filter(
    (candidate): candidate is ExpectedLocalPort => candidate !== null,
  );
}

export function registerProcessListRoutes(
  app: FastifyInstance,
  options: ProcessRouteOptions,
): void {
  const { processManager, projectStore } = options;
  const portInspectorService =
    options.portInspectorService ?? new PortInspectorService();

  app.get(
    '/processes',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            workspaceId: { type: 'string', minLength: 1, maxLength: 200 },
            projectId: { type: 'string', minLength: 1, maxLength: 200 },
            kind: { type: 'string', enum: ['server', 'test'] },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['processes'],
            properties: {
              processes: {
                type: 'array',
                items: managedProcessResponseSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const query = request.query as {
        workspaceId?: string;
        projectId?: string;
        kind?: 'server' | 'test';
      };
      const projects = projectStore.listProjects();
      const projectsById = new Map(
        projects.map((project) => [project.id, project]),
      );
      const managed = await processManager.listProcesses();
      const processes = managed.filter((process) => {
        if (process.kind !== 'server' && process.kind !== 'test') return false;
        if (query.kind && process.kind !== query.kind) return false;
        if (query.projectId && process.projectId !== query.projectId)
          return false;
        const project = projectsById.get(process.projectId);
        if (!project) return false;
        if (query.workspaceId && project.workspaceId !== query.workspaceId)
          return false;
        return true;
      });
      return { processes };
    },
  );

  app.get(
    '/ports',
    {
      schema: {
        response: {
          200: localPortInspectionResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => {
      const projects = projectStore.listProjects();
      const knownProjectIds = new Set(projects.map((project) => project.id));
      const projectNames = Object.fromEntries(
        projects.map((project) => [project.id, project.name]),
      );
      const [managedProcesses, expectedPorts] = await Promise.all([
        processManager.listProcesses(),
        expectedLocalPorts(options),
      ]);
      const inspection = await portInspectorService.inspect({
        managedProcesses: managedProcesses.filter((managed) =>
          knownProjectIds.has(managed.projectId),
        ),
        expectedPorts,
        projectNames,
      });

      return { inspection };
    },
  );

  app.post(
    '/processes/cleanup',
    {
      schema: {
        response: {
          200: logRetentionSweepResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => {
      const removed = await sweepStaleProcesses(processManager.stateDirectory, {
        removeAllTerminal: true,
      });

      return {
        removed,
        removedCount: removed.length,
      };
    },
  );
}
