import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import path from "node:path";

import {
  test
} from "node:test";

const TOKEN = "c".repeat(64);

interface JsonResponse {
  error?: string;
  message?: string;
  projects?: Array<{
    id: string;
    name: string;
  }>;
  process?: unknown;
  workspaces?: unknown[];
}

test(
  "handles workspace and process route errors consistently",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(
        tmpdir(),
        "dev-dashboard-api-routes-"
      )
    );

    const workspacePath = path.join(
      fixtureRoot,
      "workspace"
    );

    const projectPath = path.join(
      workspacePath,
      "sample-node"
    );

    await mkdir(projectPath, {
      recursive: true
    });

    await mkdir(
      path.join(projectPath, "public"),
      { recursive: true }
    );

    await writeFile(
      path.join(projectPath, "public", "favicon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    );

    await writeFile(
      path.join(projectPath, "package.json"),
      JSON.stringify(
        {
          name: "sample-node",
          private: true,
          scripts: {}
        },
        null,
        2
      )
    );

    const previousConfigDirectory =
      process.env.DEV_DASHBOARD_CONFIG_DIR;

    const previousStateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR;

    process.env.DEV_DASHBOARD_CONFIG_DIR =
      path.join(fixtureRoot, "config");

    process.env.DEV_DASHBOARD_STATE_DIR =
      path.join(fixtureRoot, "state");

    const previousDirectoryRoot =
      process.env.DEV_DASHBOARD_DIRECTORY_ROOT;

    process.env.DEV_DASHBOARD_DIRECTORY_ROOT =
      fixtureRoot;

    const {
      buildApp
    } = await import("../src/app.js");

    const app = await buildApp({
      localToken: TOKEN
    });

    context.after(async () => {
      await app.close();

      if (previousConfigDirectory === undefined) {
        delete process.env.DEV_DASHBOARD_CONFIG_DIR;
      } else {
        process.env.DEV_DASHBOARD_CONFIG_DIR =
          previousConfigDirectory;
      }

      if (previousDirectoryRoot === undefined) {
        delete process.env.DEV_DASHBOARD_DIRECTORY_ROOT;
      } else {
        process.env.DEV_DASHBOARD_DIRECTORY_ROOT =
          previousDirectoryRoot;
      }

      if (previousStateDirectory === undefined) {
        delete process.env.DEV_DASHBOARD_STATE_DIR;
      } else {
        process.env.DEV_DASHBOARD_STATE_DIR =
          previousStateDirectory;
      }

      await rm(fixtureRoot, {
        recursive: true,
        force: true
      });
    });

    const headers = {
      "x-dev-dashboard-token": TOKEN
    };

    await context.test(
      "lists directories inside the configured root",
      async () => {
        const response = await app.inject({
          method: "GET",
          url: `/api/directories?path=${encodeURIComponent(fixtureRoot)}`,
          headers
        });

        const body = response.json<{
          currentPath: string;
          directories: Array<{
            name: string;
            path: string;
          }>;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.currentPath, fixtureRoot);
        assert.equal(
          body.directories.some(
            (directory) => directory.path === workspacePath
          ),
          true
        );
      }
    );

    await context.test(
      "returns controlled errors for invalid directory paths",
      async () => {
        const missingPath = path.join(
          fixtureRoot,
          "missing-directory"
        );

        const missingResponse = await app.inject({
          method: "GET",
          url: `/api/directories?path=${encodeURIComponent(missingPath)}`,
          headers
        });

        assert.equal(missingResponse.statusCode, 400);
        assert.equal(
          missingResponse.json<JsonResponse>().error,
          "INVALID_DIRECTORY"
        );

        const outsideResponse = await app.inject({
          method: "GET",
          url: `/api/directories?path=${encodeURIComponent(tmpdir())}`,
          headers
        });

        assert.equal(outsideResponse.statusCode, 403);
        assert.equal(
          outsideResponse.json<JsonResponse>().error,
          "DIRECTORY_OUTSIDE_ROOT"
        );
      }
    );

    await context.test(
      "returns a controlled error when the configured root is invalid",
      async () => {
        const configuredRoot =
          process.env.DEV_DASHBOARD_DIRECTORY_ROOT;

        process.env.DEV_DASHBOARD_DIRECTORY_ROOT = path.join(
          fixtureRoot,
          "missing-root"
        );

        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/directories",
            headers
          });

          assert.equal(response.statusCode, 400);
          assert.equal(
            response.json<JsonResponse>().error,
            "INVALID_DIRECTORY"
          );
        } finally {
          if (configuredRoot === undefined) {
            delete process.env.DEV_DASHBOARD_DIRECTORY_ROOT;
          } else {
            process.env.DEV_DASHBOARD_DIRECTORY_ROOT = configuredRoot;
          }
        }
      }
    );

    await context.test(
      "validates workspace payloads",
      async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers,
          payload: {
            name: "Sem caminho"
          }
        });

        const body = response.json<JsonResponse>();

        assert.equal(response.statusCode, 400);
        assert.equal(
          body.error,
          "VALIDATION_ERROR"
        );
      }
    );

    let workspaceId = "";

    await context.test(
      "creates, lists and rejects a duplicate workspace",
      async () => {
        const createResponse = await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers,
          payload: {
            name: "Fixture",
            path: workspacePath
          }
        });

        const workspace = createResponse.json<{
          id: string;
          path: string;
        }>();

        assert.equal(createResponse.statusCode, 201);
        assert.equal(workspace.path, workspacePath);

        workspaceId = workspace.id;

        const listResponse = await app.inject({
          method: "GET",
          url: "/api/workspaces",
          headers
        });

        const listBody =
          listResponse.json<JsonResponse>();

        assert.equal(listResponse.statusCode, 200);
        assert.equal(
          listBody.workspaces?.length,
          1
        );

        const duplicateResponse = await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers,
          payload: {
            name: "Duplicado",
            path: workspacePath
          }
        });

        const duplicateBody =
          duplicateResponse.json<JsonResponse>();

        assert.equal(
          duplicateResponse.statusCode,
          409
        );

        assert.equal(
          duplicateBody.error,
          "WORKSPACE_ALREADY_EXISTS"
        );
      }
    );

    await context.test(
      "does not expose filesystem errors while creating a workspace",
      async () => {
        const missingPath = path.join(
          fixtureRoot,
          "missing-workspace"
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers,
          payload: {
            name: "Inexistente",
            path: missingPath
          }
        });

        const body = response.json<JsonResponse>();

        assert.equal(response.statusCode, 400);
        assert.equal(
          body.error,
          "WORKSPACE_CREATION_FAILED"
        );

        assert.equal(
          response.body.includes(missingPath),
          false
        );
      }
    );

    await context.test(
      "returns not found for an unknown workspace",
      async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/workspaces/missing/scan",
          headers
        });

        const body = response.json<JsonResponse>();

        assert.equal(response.statusCode, 404);
        assert.equal(
          body.error,
          "WORKSPACE_NOT_FOUND"
        );
      }
    );

    let projectId = "";

    await context.test(
      "scans the workspace and exposes its project",
      async () => {
        const scanResponse = await app.inject({
          method: "POST",
          url: `/api/workspaces/${workspaceId}/scan`,
          headers
        });

        const scanBody = scanResponse.json<{
          projects: Array<{
            id: string;
            name: string;
          }>;
        }>();

        assert.equal(scanResponse.statusCode, 200);
        assert.equal(scanBody.projects.length, 1);
        assert.equal(
          scanBody.projects[0]?.name,
          "sample-node"
        );

        projectId = scanBody.projects[0]?.id ?? "";

        const projectsResponse = await app.inject({
          method: "GET",
          url: "/api/projects",
          headers
        });

        const projectsBody =
          projectsResponse.json<JsonResponse>();

        assert.equal(
          projectsResponse.statusCode,
          200
        );

        assert.equal(
          projectsBody.projects?.length,
          1
        );

        const projectResponse = await app.inject({
          method: "GET",
          url: `/api/projects/${projectId}`,
          headers
        });

        const projectBody = projectResponse.json<{
          project: {
            id: string;
            name: string;
          };
        }>();

        assert.equal(projectResponse.statusCode, 200);
        assert.equal(projectBody.project.id, projectId);
        assert.equal(projectBody.project.name, "sample-node");

        const faviconResponse = await app.inject({
          method: "GET",
          url: `/api/projects/${projectId}/favicon`,
          headers
        });

        assert.equal(faviconResponse.statusCode, 200);
        assert.match(
          String(faviconResponse.headers["content-type"]),
          /image\/svg\+xml/
        );
      }
    );

    await context.test(
      "persists project server port settings",
      async () => {
        const initialResponse = await app.inject({
          method: "GET",
          url: `/api/projects/${projectId}/server-settings`,
          headers
        });

        const initialBody = initialResponse.json<{
          settings: {
            port?: number;
          };
        }>();

        assert.equal(initialResponse.statusCode, 200);
        assert.equal(initialBody.settings.port, undefined);

        const saveResponse = await app.inject({
          method: "PUT",
          url: `/api/projects/${projectId}/server-settings`,
          headers,
          payload: {
            port: 3_150
          }
        });

        const saveBody = saveResponse.json<{
          settings: {
            port?: number;
          };
        }>();

        assert.equal(saveResponse.statusCode, 200);
        assert.equal(saveBody.settings.port, 3_150);

        const clearResponse = await app.inject({
          method: "PUT",
          url: `/api/projects/${projectId}/server-settings`,
          headers,
          payload: {
            port: null
          }
        });

        const clearBody = clearResponse.json<{
          settings: {
            port?: number;
          };
        }>();

        assert.equal(clearResponse.statusCode, 200);
        assert.equal(clearBody.settings.port, undefined);
      }
    );

    await context.test(
      "maps real ProcessManager errors",
      async () => {
        const statusResponse = await app.inject({
          method: "GET",
          url: `/api/projects/${projectId}/process`,
          headers
        });

        const statusBody =
          statusResponse.json<JsonResponse>();

        assert.equal(statusResponse.statusCode, 200);
        assert.equal(statusBody.process, null);

        const logsResponse = await app.inject({
          method: "GET",
          url: `/api/projects/${projectId}/process/logs`,
          headers
        });

        const logsBody =
          logsResponse.json<JsonResponse>();

        assert.equal(logsResponse.statusCode, 404);
        assert.equal(
          logsBody.error,
          "PROCESS_NOT_FOUND"
        );

        const clearLogsResponse = await app.inject({
          method: "DELETE",
          url: `/api/projects/${projectId}/process/logs`,
          headers
        });

        const clearLogsBody =
          clearLogsResponse.json<JsonResponse>();

        assert.equal(clearLogsResponse.statusCode, 404);
        assert.equal(
          clearLogsBody.error,
          "PROCESS_NOT_FOUND"
        );

        const startResponse = await app.inject({
          method: "POST",
          url: `/api/projects/${projectId}/process/start`,
          headers,
          payload: {}
        });

        const startBody =
          startResponse.json<JsonResponse>();

        assert.equal(startResponse.statusCode, 400);
        assert.equal(
          startBody.error,
          "PROJECT_SCRIPT_NOT_FOUND"
        );

        const stopResponse = await app.inject({
          method: "POST",
          url: `/api/projects/${projectId}/process/stop`,
          headers
        });

        const stopBody =
          stopResponse.json<JsonResponse>();

        assert.equal(stopResponse.statusCode, 404);
        assert.equal(
          stopBody.error,
          "PROCESS_NOT_FOUND"
        );
      }
    );

    await context.test(
      "returns a standardized project not found error",
      async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/projects/missing/process",
          headers
        });

        const body = response.json<JsonResponse>();

        assert.equal(response.statusCode, 404);
        assert.equal(
          body.error,
          "PROJECT_NOT_FOUND"
        );
      }
    );

    await context.test(
      "removes the workspace",
      async () => {
        const response = await app.inject({
          method: "DELETE",
          url: `/api/workspaces/${workspaceId}`,
          headers
        });

        assert.equal(response.statusCode, 204);
        assert.equal(response.body, "");
      }
    );
  }
);
