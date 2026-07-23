import type {
  FastifyPluginAsync
} from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: [
              "status",
              "service",
              "timestamp"
            ],
            properties: {
              status: {
                type: "string"
              },
              service: {
                type: "string"
              },
              timestamp: {
                type: "string"
              }
            }
          }
        }
      }
    },
    async () => ({
      status: "ok",
      service: "dev-dashboard-api",
      timestamp: new Date().toISOString()
    })
  );
};
