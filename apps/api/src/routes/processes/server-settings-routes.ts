import type { FastifyInstance } from 'fastify';

import {
  listNodeServerEnvironments,
  ProjectServerSettingsError,
} from '@dev-dashboard/process-manager';

import {
  commonErrorResponseSchemas,
  projectServerSettingsResponseSchema,
} from '../../http/response-schemas.js';
import {
  projectParamsSchema,
  requireProject,
  serverSettingsApiError,
  type ProcessRouteOptions,
  type ProjectParams,
  type SaveServerSettingsBody,
} from './helpers.js';

const SERVER_ENVIRONMENT_TEMPLATE_OR_BACKUP_PATTERN =
  /(?:^|[._-])(?:local|sample|example|bak(?:up)?|old|orig)(?:$|[._-])/i;

const serverSettingsEnvelopeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['settings', 'environments'],
  properties: {
    settings: projectServerSettingsResponseSchema,
    environments: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
        pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$',
      },
    },
  },
} as const;

export function registerServerSettingsRoutes(
  app: FastifyInstance,
  options: ProcessRouteOptions,
): void {
  const { serverSettingsRepository, projectStore } = options;

  async function environmentsForProject(
    project: ReturnType<typeof requireProject>,
  ): Promise<string[]> {
    if (project.type !== 'node') return [];

    return (await listNodeServerEnvironments(project.path)).filter(
      (environment) =>
        !SERVER_ENVIRONMENT_TEMPLATE_OR_BACKUP_PATTERN.test(environment),
    );
  }

  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/server-settings',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: serverSettingsEnvelopeResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const [settings, environments] = await Promise.all([
        serverSettingsRepository.find(project.id),
        environmentsForProject(project),
      ]);

      return { settings, environments };
    },
  );

  app.put<{
    Params: ProjectParams;
    Body: SaveServerSettingsBody;
  }>(
    '/projects/:projectId/server-settings',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            port: {
              anyOf: [
                {
                  type: 'integer',
                  minimum: 1_024,
                  maximum: 65_535,
                },
                {
                  type: 'null',
                },
              ],
            },
            environment: {
              anyOf: [
                {
                  type: 'string',
                  minLength: 1,
                  maxLength: 64,
                  pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        response: {
          200: serverSettingsEnvelopeResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);

      try {
        const [current, environments] = await Promise.all([
          serverSettingsRepository.find(project.id),
          environmentsForProject(project),
        ]);
        const requestedEnvironment = request.body.environment;

        if (
          requestedEnvironment !== undefined &&
          requestedEnvironment !== null &&
          (project.type !== 'node' ||
            !environments.includes(requestedEnvironment))
        ) {
          throw new ProjectServerSettingsError(
            'SERVER_ENVIRONMENT_NOT_FOUND',
            `O arquivo .env.${requestedEnvironment} não foi encontrado.`,
          );
        }

        const settings = await serverSettingsRepository.save(project.id, {
          ...(request.body.port === undefined
            ? current.port !== undefined
              ? { port: current.port }
              : {}
            : request.body.port !== null
              ? { port: request.body.port }
              : {}),
          ...(request.body.environment === undefined
            ? current.environment
              ? { environment: current.environment }
              : {}
            : request.body.environment !== null
              ? { environment: request.body.environment }
              : {}),
        });

        return { settings, environments };
      } catch (error) {
        if (error instanceof ProjectServerSettingsError) {
          throw serverSettingsApiError(error);
        }

        throw error;
      }
    },
  );
}
