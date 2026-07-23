import type {
  FastifyPluginAsync
} from "fastify";

import {
  scanWorkspace
} from "@dev-dashboard/project-discovery";

import {
  listWorkspaceScans,
  saveWorkspaceScan
} from "../store/project-store.js";

interface ScanWorkspaceBody {
  id: string;
  path: string;
  includeUnknown?: boolean;
}

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces", async () => ({
    workspaces: listWorkspaceScans()
  }));

  app.post<{
    Body: ScanWorkspaceBody;
  }>(
    "/workspaces/scan",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "path"
          ],
          properties: {
            id: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              pattern: "^[a-zA-Z0-9_-]+$"
            },
            path: {
              type: "string",
              minLength: 1
            },
            includeUnknown: {
              type: "boolean"
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const result = await scanWorkspace(
          {
            id: request.body.id,
            path: request.body.path
          },
          {
            ...(request.body.includeUnknown !== undefined
              ? {
                  includeUnknown: request.body.includeUnknown
                }
              : {})
          }
        );

        return saveWorkspaceScan(result);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível escanear o workspace";

        request.log.warn(
          {
            error,
            workspaceId: request.body.id,
            workspacePath: request.body.path
          },
          "Workspace scan failed"
        );

        return reply.code(400).send({
          error: "WORKSPACE_SCAN_FAILED",
          message
        });
      }
    }
  );
};
