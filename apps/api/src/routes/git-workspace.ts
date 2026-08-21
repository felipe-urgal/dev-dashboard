import type { FastifyPluginAsync } from 'fastify';

import { GitBranchPublishService } from '../services/git-branch-publish-service.js';
import { GitBranchService } from '../services/git-branch-service.js';
import { GitBranchSquashService } from '../services/git-branch-squash-service.js';
import { GitWorkspaceService } from '../services/git-workspace-service.js';
import { registerBranchPublishRoutes } from './git-workspace/branch-publish-routes.js';
import { registerBranchSquashRoutes } from './git-workspace/branch-squash-routes.js';
import { registerBranchTrackingRoutes } from './git-workspace/branch-tracking-routes.js';
import { registerWorkspaceRoutes } from './git-workspace/workspace-routes.js';
import type { GitWorkspaceRouteOptions } from './git-workspace/helpers.js';

export const gitWorkspaceRoutes: FastifyPluginAsync<
  GitWorkspaceRouteOptions
> = async (app, options) => {
  const workspaceService = new GitWorkspaceService();
  const branchService = new GitBranchService();
  const branchPublishService = new GitBranchPublishService();
  const branchSquashService = new GitBranchSquashService();

  registerWorkspaceRoutes(app, options, workspaceService);
  registerBranchTrackingRoutes(app, options, branchService);
  registerBranchPublishRoutes(app, options, branchPublishService);
  registerBranchSquashRoutes(app, options, branchSquashService);
};
