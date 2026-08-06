import type { FastifyInstance } from 'fastify';

import type { GitBranchService } from '../../services/git-branch-service.js';
import {
  commonErrorResponseSchemas,
  gitBranchMutationResponseSchema,
} from '../../http/response-schemas.js';
import {
  branchRemoteConfirmationResponseSchema,
  findProject,
  projectParamsSchema,
  trackingConfirmationBodySchema,
  trackingMutationBodySchema,
  translateBranchError,
  type GitWorkspaceRouteOptions,
  type ProjectParams,
} from './helpers.js';

export function registerBranchTrackingRoutes(
  app: FastifyInstance,
  options: GitWorkspaceRouteOptions,
  branchService: GitBranchService,
): void {
  app.post<{ Params: ProjectParams; Body: { remoteBranch: string } }>(
    '/projects/:projectId/git/branches/track/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: trackingConfirmationBodySchema,
        response: {
          201: branchRemoteConfirmationResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: branchService.prepareTrackingConfirmation(
            project.id,
            request.body.remoteBranch,
          ),
        });
      } catch (error) {
        translateBranchError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { remoteBranch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/track',
    {
      schema: {
        params: projectParamsSchema,
        body: trackingMutationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          branch: await branchService.trackRemoteBranch(
            project.path,
            project.id,
            request.body.remoteBranch,
            request.body.confirmationToken,
          ),
        });
      } catch (error) {
        translateBranchError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { remoteBranch: string } }>(
    '/projects/:projectId/git/branches/remote/delete/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: trackingConfirmationBodySchema,
        response: {
          201: branchRemoteConfirmationResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: branchService.prepareRemoteDeleteConfirmation(
            project.id,
            request.body.remoteBranch,
          ),
        });
      } catch (error) {
        translateBranchError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { remoteBranch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/remote/delete',
    {
      schema: {
        params: projectParamsSchema,
        body: trackingMutationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        return {
          branch: await branchService.deleteRemoteBranch(
            project.path,
            project.id,
            request.body.remoteBranch,
            request.body.confirmationToken,
          ),
        };
      } catch (error) {
        translateBranchError(error);
      }
    },
  );
}
