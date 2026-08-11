import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { registerRailsCredentialsRoutes } from './rails/credentials-routes.js';
import { registerRailsMigrationPtyRoutes } from './rails/migration-pty-routes.js';
import { registerRailsMutationRoutes } from './rails/mutation-routes.js';
import { registerRailsReadRoutes } from './rails/read-routes.js';
import { registerRailsWorkerRoutes } from './rails/worker-routes.js';
import type { RailsRouteOptions } from './rails/helpers.js';

export const railsRoutes: FastifyPluginAsync<
  RailsRouteOptions & FastifyPluginOptions
> = async (app, options) => {
  registerRailsReadRoutes(app, options);
  registerRailsMutationRoutes(app, options);
  registerRailsMigrationPtyRoutes(app, options);
  registerRailsWorkerRoutes(app, options);
  registerRailsCredentialsRoutes(app, options);
};
