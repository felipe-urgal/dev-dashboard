import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import { registerProcessListRoutes } from './processes/process-list-routes.js';
import { registerServerProcessRoutes } from './processes/server-process-routes.js';
import { registerServerSettingsRoutes } from './processes/server-settings-routes.js';
import type { ProcessRouteOptions } from './processes/helpers.js';

export const processRoutes: FastifyPluginAsync<
  ProcessRouteOptions & FastifyPluginOptions
> = async (app, options) => {
  registerServerSettingsRoutes(app, options);
  registerServerProcessRoutes(app, options);
  registerProcessListRoutes(app, options);
};
