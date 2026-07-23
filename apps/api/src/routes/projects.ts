import type {
  FastifyPluginAsync
} from "fastify";

import {
  listProjects
} from "../store/project-store.js";

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects", async () => ({
    projects: listProjects()
  }));
};
