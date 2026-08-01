import type { FastifyPluginAsync } from 'fastify';

import { GitBranchService } from '../services/git-branch-service.js';
import { GitWorkspaceService } from '../services/git-workspace-service.js';
import { registerBranchTrackingRoutes } from './git-workspace/branch-tracking-routes.js';
import { registerWorkspaceRoutes } from './git-workspace/workspace-routes.js';
import type { GitWorkspaceRouteOptions } from './git-workspace/helpers.js';

export const gitWorkspaceRoutes: FastifyPluginAsync<
  GitWorkspaceRouteOptions
> = async (app, options) => {
  const workspaceService = new GitWorkspaceService();
  const branchService = new GitBranchService();

  registerWorkspaceRoutes(app, options, workspaceService);
  registerBranchTrackingRoutes(app, options, branchService);
};
