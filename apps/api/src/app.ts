import Fastify, {
  type FastifyInstance
} from "fastify";

import {
  healthRoutes
} from "./routes/health.js";

import {
  projectRoutes
} from "./routes/projects.js";

import {
  processRoutes
} from "./routes/processes.js";

import {
  workspaceRoutes
} from "./routes/workspaces.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  app.register(healthRoutes, {
    prefix: "/api"
  });

  app.register(workspaceRoutes, {
    prefix: "/api"
  });

  app.register(projectRoutes, {
    prefix: "/api"
  });

  app.register(processRoutes, {
    prefix: "/api"
  });

  return app;
}
