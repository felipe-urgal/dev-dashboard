import type { FastifyInstance } from 'fastify';

import { sweepStaleProcesses } from '@dev-dashboard/process-manager';

import {
  commonErrorResponseSchemas,
  logRetentionSweepResponseSchema,
  managedProcessResponseSchema,
} from '../../http/response-schemas.js';
import type { ProcessRouteOptions } from './helpers.js';

export function registerProcessListRoutes(
  app: FastifyInstance,
  options: ProcessRouteOptions,
): void {
  const { processManager, projectStore } = options;

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
            kind: { type: 'string', enum: ['server', 'test', 'compose-build'] },
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
        kind?: 'server' | 'test' | 'compose-build';
      };
      const projects = projectStore.listProjects();
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      const managed = await processManager.listProcesses();
      const processes = managed.filter((process) => {
        if (process.kind !== 'server' && process.kind !== 'test' && process.kind !== 'compose-build') return false;
        if (query.kind && process.kind !== query.kind) return false;
        if (query.projectId && process.projectId !== query.projectId) return false;
        const project = projectsById.get(process.projectId);
        if (!project) return false;
        if (query.workspaceId && project.workspaceId !== query.workspaceId) return false;
        return true;
      });
      return { processes };
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
      const removed = await sweepStaleProcesses(
        processManager.stateDirectory,
        {
          removeAllTerminal: true,
        },
      );

      return {
        removed,
        removedCount: removed.length,
      };
    },
  );
}
