import type { FastifyPluginAsync } from 'fastify';

import { registerFaviconRoute } from './projects/favicon-route.js';
import { registerGitDiffRoutes } from './projects/git-diff-routes.js';
import { registerProjectListRoutes } from './projects/list-routes.js';
import type { ProjectRouteOptions } from './projects/helpers.js';

export const projectRoutes: FastifyPluginAsync<ProjectRouteOptions> = async (
  app,
  options,
) => {
  registerProjectListRoutes(app, options);
  registerFaviconRoute(app, options);
  registerGitDiffRoutes(app, options);
};
