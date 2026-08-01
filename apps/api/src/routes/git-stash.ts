import type { FastifyPluginAsync } from 'fastify';

import { GitStashService } from '../services/git-stash-service.js';
import { registerStashListDetailRoutes } from './git-stash/list-detail-routes.js';
import { registerStashMutationRoutes } from './git-stash/mutation-routes.js';
import type { GitStashRouteOptions } from './git-stash/helpers.js';

export const gitStashRoutes: FastifyPluginAsync<GitStashRouteOptions> = async (
  app,
  options,
) => {
  const service = new GitStashService();

  registerStashListDetailRoutes(app, options, service);
  registerStashMutationRoutes(app, options, service);
};
