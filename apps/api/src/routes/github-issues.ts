import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  GithubIssuesError,
  GithubIssuesService,
} from '../services/github-issues-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface GithubIssuesRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

interface IssueParams extends ProjectParams {
  issueNumber: number;
}

interface IssueQuery {
  state: 'open' | 'closed';
  page?: number;
}

interface IssueBody {
  title: string;
  body: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const issueParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'issueNumber'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    issueNumber: { type: 'integer', minimum: 1 },
  },
} as const;

const issueQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state'],
  properties: {
    state: { type: 'string', enum: ['open', 'closed'] },
    page: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
  },
} as const;

const issueBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 256 },
    body: { type: 'string', maxLength: 20_000 },
  },
} as const;

const issueResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'number',
    'title',
    'body',
    'state',
    'url',
    'author',
    'labels',
    'updatedAt',
  ],
  properties: {
    number: { type: 'integer', minimum: 1 },
    title: { type: 'string' },
    body: { type: 'string' },
    state: { type: 'string', enum: ['open', 'closed'] },
    url: { type: 'string' },
    author: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' } },
    updatedAt: { type: 'string' },
  },
} as const;

const singleIssueResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['issue'],
  properties: { issue: issueResponseSchema },
} as const;

const listIssuesResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['repository', 'page', 'hasMore', 'issues'],
  properties: {
    repository: { type: 'string' },
    page: { type: 'integer' },
    hasMore: { type: 'boolean' },
    issues: { type: 'array', items: issueResponseSchema },
  },
} as const;

function translateError(error: unknown): never {
  if (error instanceof GithubIssuesError) {
    const status =
      error.code === 'INVALID_INPUT' || error.code === 'UNSUPPORTED_REMOTE'
        ? 400
        : error.code === 'ISSUE_NOT_FOUND'
          ? 404
          : 500;
    throw new ApiError({
      statusCode: status,
      code:
        status === 400
          ? 'BAD_REQUEST'
          : status === 404
            ? 'NOT_FOUND'
            : 'GIT_REMOTE_UNAVAILABLE',
      message: error.message,
    });
  }
  throw error;
}

export const githubIssuesRoutes: FastifyPluginAsync<
  GithubIssuesRouteOptions
> = async (app, options) => {
  const service = new GithubIssuesService();

  function projectPath(projectId: string): string {
    const project = options.projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project.path;
  }

  app.get<{ Params: ProjectParams; Querystring: IssueQuery }>(
    '/projects/:projectId/git/issues',
    {
      schema: {
        params: projectParamsSchema,
        querystring: issueQuerySchema,
        response: {
          200: listIssuesResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return await service.list(
          projectPath(request.params.projectId),
          request.query.state,
          request.query.page ?? 1,
        );
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: IssueBody }>(
    '/projects/:projectId/git/issues',
    {
      schema: {
        params: projectParamsSchema,
        body: issueBodySchema,
        response: {
          201: singleIssueResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      try {
        const issue = await service.create(
          projectPath(request.params.projectId),
          request.body.title,
          request.body.body,
        );
        return reply.code(201).send({ issue });
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.patch<{ Params: IssueParams; Body: IssueBody }>(
    '/projects/:projectId/git/issues/:issueNumber',
    {
      schema: {
        params: issueParamsSchema,
        body: issueBodySchema,
        response: {
          200: singleIssueResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          issue: await service.edit(
            projectPath(request.params.projectId),
            request.params.issueNumber,
            request.body.title,
            request.body.body,
          ),
        };
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{ Params: IssueParams }>(
    '/projects/:projectId/git/issues/:issueNumber/close',
    {
      schema: {
        params: issueParamsSchema,
        response: {
          200: singleIssueResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          issue: await service.close(
            projectPath(request.params.projectId),
            request.params.issueNumber,
          ),
        };
      } catch (error) {
        translateError(error);
      }
    },
  );
};
