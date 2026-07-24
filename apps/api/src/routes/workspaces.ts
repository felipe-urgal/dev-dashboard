import type {
  FastifyPluginAsync
} from "fastify";

import path from "node:path";

import {
  WorkspaceRepository,
  WorkspaceRepositoryError
} from "@dev-dashboard/core";

import {
  scanWorkspace
} from "@dev-dashboard/project-discovery";

import {
  ProcessManager
} from "@dev-dashboard/process-manager";

import {
  ApiError
} from "../http/api-error.js";

import {
  deleteWorkspaceScan,
  saveWorkspaceScan
} from "../store/project-store.js";

import {
  projectResponseSchema,
  workspaceResponseSchema,
  workspaceScanWarningResponseSchema
} from "../http/response-schemas.js";

interface CreateWorkspaceBody {
  id?: string;
  name: string;
  path: string;
}

interface WorkspaceParams {
  workspaceId: string;
}

const workspaceRepository =
  new WorkspaceRepository();

const processManager = new ProcessManager();

function isPathInside(
  parentPath: string,
  candidatePath: string
): boolean {
  const relativePath = path.relative(
    parentPath,
    candidatePath
  );

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

function workspaceRepositoryApiError(
  error: WorkspaceRepositoryError
): ApiError {
  switch (error.code) {
    case "WORKSPACE_NOT_FOUND":
      return new ApiError({
        statusCode: 404,
        code: error.code,
        message: error.message
      });

    case "WORKSPACE_ALREADY_EXISTS":
      return new ApiError({
        statusCode: 409,
        code: error.code,
        message: error.message
      });

    default:
      return new ApiError({
        statusCode: 400,
        code: error.code,
        message: error.message
      });
  }
}

export const workspaceRoutes: FastifyPluginAsync =
  async (app) => {
    app.get(
      "/workspaces",
      {
        schema: {
          response: {
            200: {
              type: "object",
              additionalProperties: false,
              required: ["workspaces"],
              properties: {
                workspaces: {
                  type: "array",
                  items: workspaceResponseSchema
                }
              }
            }
          }
        }
      },
      async () => ({
        workspaces:
          await workspaceRepository.list()
      })
    );

    app.post<{
      Body: CreateWorkspaceBody;
    }>(
      "/workspaces",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: [
              "name",
              "path"
            ],
            properties: {
              id: {
                type: "string",
                minLength: 1,
                maxLength: 100
              },
              name: {
                type: "string",
                minLength: 1,
                maxLength: 100
              },
              path: {
                type: "string",
                minLength: 1
              }
            }
          },
          response: {
            201: workspaceResponseSchema
          }
        }
      },
      async (request, reply) => {
        try {
          const workspace =
            await workspaceRepository.create({
              name: request.body.name,
              path: request.body.path,
              ...(request.body.id !== undefined
                ? {
                    id: request.body.id
                  }
                : {})
            });

          return reply
            .code(201)
            .send(workspace);
        } catch (error) {
          if (
            error instanceof WorkspaceRepositoryError
          ) {
            throw workspaceRepositoryApiError(error);
          }

          request.log.warn(
            {
              error,
              workspacePath: request.body.path
            },
            "Workspace creation failed"
          );

          throw new ApiError({
            statusCode: 400,
            code: "WORKSPACE_CREATION_FAILED",
            message:
              "Não foi possível cadastrar o workspace. Verifique se o caminho existe e é acessível."
          });
        }
      }
    );

    app.post<{
      Params: WorkspaceParams;
    }>(
      "/workspaces/:workspaceId/scan",
      {
        schema: {
          params: {
            type: "object",
            additionalProperties: false,
            required: [
              "workspaceId"
            ],
            properties: {
              workspaceId: {
                type: "string",
                minLength: 1
              }
            }
          },
          response: {
            200: {
              type: "object",
              additionalProperties: false,
              required: [
                "workspaceId",
                "workspacePath",
                "projects",
                "warnings",
                "scannedAt"
              ],
              properties: {
                workspaceId: { type: "string" },
                workspacePath: { type: "string" },
                projects: {
                  type: "array",
                  items: projectResponseSchema
                },
                warnings: {
                  type: "array",
                  items: workspaceScanWarningResponseSchema
                },
                scannedAt: { type: "string" }
              }
            }
          }
        }
      },
      async (request) => {
        const workspace =
          await workspaceRepository.find(
            request.params.workspaceId
          );

        if (!workspace) {
          throw new ApiError({
            statusCode: 404,
            code: "WORKSPACE_NOT_FOUND",
            message: "Workspace não encontrado."
          });
        }

        if (!workspace.enabled) {
          throw new ApiError({
            statusCode: 409,
            code: "WORKSPACE_DISABLED",
            message: "O workspace está desabilitado."
          });
        }

        try {
          const result = await scanWorkspace(
            workspace
          );

          return saveWorkspaceScan(result);
        } catch (error) {
          request.log.warn(
            {
              error,
              workspaceId: workspace.id,
              workspacePath: workspace.path
            },
            "Workspace scan failed"
          );

          throw new ApiError({
            statusCode: 400,
            code: "WORKSPACE_SCAN_FAILED",
            message:
              "Não foi possível escanear o workspace."
          });
        }
      }
    );

    app.delete<{
      Params: WorkspaceParams;
    }>(
      "/workspaces/:workspaceId",
      async (request, reply) => {
        try {
          const workspace =
            await workspaceRepository.find(
              request.params.workspaceId
            );

          if (!workspace) {
            throw new ApiError({
              statusCode: 404,
              code: "WORKSPACE_NOT_FOUND",
              message: "Workspace não encontrado."
            });
          }

          const managedProcesses =
            await processManager.listProcesses();

          const activeProcess = managedProcesses.find(
            (managedProcess) =>
              (managedProcess.status === "running" ||
                managedProcess.status === "starting" ||
                managedProcess.status === "stopping") &&
              (managedProcess.workspaceId === workspace.id ||
                (managedProcess.cwd !== undefined &&
                  isPathInside(
                    workspace.path,
                    managedProcess.cwd
                  )))
          );

          if (activeProcess) {
            throw new ApiError({
              statusCode: 409,
              code: "WORKSPACE_PROCESS_RUNNING",
              message:
                "Pare os processos ativos antes de remover o workspace."
            });
          }

          await workspaceRepository.remove(
            request.params.workspaceId
          );

          deleteWorkspaceScan(
            request.params.workspaceId
          );

          return reply.code(204).send();
        } catch (error) {
          if (error instanceof ApiError) {
            throw error;
          }

          if (
            error instanceof WorkspaceRepositoryError
          ) {
            throw workspaceRepositoryApiError(error);
          }

          throw error;
        }
      }
    );
  };
