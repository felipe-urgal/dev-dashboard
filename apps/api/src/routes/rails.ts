import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { registerRailsMutationRoutes } from './rails/mutation-routes.js';
import { registerRailsReadRoutes } from './rails/read-routes.js';
import type { RailsRouteOptions } from './rails/helpers.js';

export const railsRoutes: FastifyPluginAsync<
  RailsRouteOptions & FastifyPluginOptions
> = async (app, options) => {
  registerRailsReadRoutes(app, options);
  registerRailsMutationRoutes(app, options);
};
