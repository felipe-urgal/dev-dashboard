import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { registerTestCommandRoutes } from './tests/command-routes.js';
import { registerTestEventsRoute } from './tests/events-route.js';
import { registerTestHistoryRoutes } from './tests/history-routes.js';
import { registerTestIntelligenceRoutes } from './tests/intelligence-routes.js';
import { registerTestProcessRoutes } from './tests/process-routes.js';
import { registerTestPtyRoutes } from './tests/pty-routes.js';
import type { TestRouteOptions } from './tests/helpers.js';

export const testRoutes: FastifyPluginAsync<
  TestRouteOptions & FastifyPluginOptions
> = async (app, options) => {
  registerTestProcessRoutes(app, options);
  registerTestCommandRoutes(app, options);
  registerTestIntelligenceRoutes(app, options);
  registerTestHistoryRoutes(app, options);
  registerTestEventsRoute(app, options);
  registerTestPtyRoutes(app, options);
};
