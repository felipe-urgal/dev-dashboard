import type {
  FastifyPluginAsync
} from "fastify";

import {
  listProjects
} from "../store/project-store.js";

import {
  projectResponseSchema
} from "../http/response-schemas.js";

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/projects",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["projects"],
            properties: {
              projects: {
                type: "array",
                items: projectResponseSchema
              }
            }
          }
        }
      }
    },
    async () => ({
      projects: listProjects()
    })
  );
};
