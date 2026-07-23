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
  deleteWorkspaceScan,
  saveWorkspaceScan
} from "../store/project-store.js";

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

function resolveErrorStatus(
  error: WorkspaceRepositoryError
): 400 | 404 | 409 {
  switch (error.code) {
    case "WORKSPACE_NOT_FOUND":
      return 404;

    case "WORKSPACE_ALREADY_EXISTS":
      return 409;

    default:
      return 400;
  }
}

export const workspaceRoutes: FastifyPluginAsync =
  async (app) => {
    app.get(
      "/workspaces",
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
            return reply
              .code(resolveErrorStatus(error))
              .send({
                error: error.code,
                message: error.message
              });
          }

          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível cadastrar o workspace.";

          request.log.warn(
            {
              error,
              workspacePath: request.body.path
            },
            "Workspace creation failed"
          );

          return reply.code(400).send({
            error: "WORKSPACE_CREATION_FAILED",
            message
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
          }
        }
      },
      async (request, reply) => {
        const workspace =
          await workspaceRepository.find(
            request.params.workspaceId
          );

        if (!workspace) {
          return reply.code(404).send({
            error: "WORKSPACE_NOT_FOUND",
            message: "Workspace não encontrado."
          });
        }

        if (!workspace.enabled) {
          return reply.code(409).send({
            error: "WORKSPACE_DISABLED",
            message: "O workspace está desabilitado."
          });
        }

        try {
          const result = await scanWorkspace(
            workspace
          );

          return saveWorkspaceScan(result);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível escanear o workspace.";

          request.log.warn(
            {
              error,
              workspaceId: workspace.id,
              workspacePath: workspace.path
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
            return reply.code(404).send({
              error: "WORKSPACE_NOT_FOUND",
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
            return reply.code(409).send({
              error: "WORKSPACE_PROCESS_RUNNING",
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
          if (
            error instanceof WorkspaceRepositoryError
          ) {
            return reply
              .code(resolveErrorStatus(error))
              .send({
                error: error.code,
                message: error.message
              });
          }

          throw error;
        }
      }
    );
  };
