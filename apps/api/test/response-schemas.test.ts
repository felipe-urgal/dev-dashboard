import assert from "node:assert/strict";

import { createHash } from "node:crypto";

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

const TOKEN = "d".repeat(64);

// Mirrors ProcessManager#createProjectKey (packages/process-manager/src/process-manager.ts)
// so the test can seed a state file the manager will actually read back.
function processStateFileName(projectId: string): string {
  const readable = projectId
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);

  const hash = createHash("sha256")
    .update(projectId)
    .digest("hex")
    .slice(0, 8);

  return `${readable}-${hash}.server.json`;
}

test(
  "response schemas strip properties not part of the public contract",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "dev-dashboard-api-schemas-")
    );

    const configDirectory = path.join(fixtureRoot, "config");
    const stateDirectory = path.join(fixtureRoot, "state");
    const processDirectory = path.join(stateDirectory, "processes");

    const previousConfigDirectory =
      process.env.DEV_DASHBOARD_CONFIG_DIR;

    const previousStateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR;

    process.env.DEV_DASHBOARD_CONFIG_DIR = configDirectory;
    process.env.DEV_DASHBOARD_STATE_DIR = stateDirectory;

    await mkdir(configDirectory, { recursive: true });
    await mkdir(processDirectory, { recursive: true });

    const pollutedWorkspaceId = "polluted-workspace";

    await writeFile(
      path.join(configDirectory, "config.json"),
      JSON.stringify(
        {
          version: 1,
          workspaces: [
            {
              id: pollutedWorkspaceId,
              name: "Fixture",
              path: fixtureRoot,
              enabled: true,
              internalDebugNote: "should not leak"
            }
          ]
        },
        null,
        2
      )
    );

    const { buildApp } = await import("../src/app.js");

    const { saveWorkspaceScan } = await import(
      "../src/store/project-store.js"
    );

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
      "strips unexpected properties from the workspace list",
      async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/workspaces",
          headers
        });

        const body = response.json<{
          workspaces: Array<Record<string, unknown>>;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(
          body.workspaces[0]?.id,
          pollutedWorkspaceId
        );
        assert.equal(
          body.workspaces[0]?.internalDebugNote,
          undefined
        );
      }
    );

    const pollutedProjectId = "polluted-project";

    await context.test(
      "strips unexpected properties from the project list",
      async () => {
        saveWorkspaceScan({
          workspaceId: pollutedWorkspaceId,
          workspacePath: fixtureRoot,
          projects: [
            {
              id: pollutedProjectId,
              name: "Polluted",
              path: fixtureRoot,
              type: "node",
              source: "workspace",
              favorite: false,
              capabilities: [],
              internalDebugNote: "should not leak"
            } as never,
          ],
          warnings: []
        });

        const response = await app.inject({
          method: "GET",
          url: "/api/projects",
          headers
        });

        const body = response.json<{
          projects: Array<Record<string, unknown>>;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(
          body.projects[0]?.id,
          pollutedProjectId
        );
        assert.equal(
          body.projects[0]?.internalDebugNote,
          undefined
        );
      }
    );

    await context.test(
      "strips unexpected properties from a process status response",
      async () => {
        await writeFile(
          path.join(
            processDirectory,
            processStateFileName(pollutedProjectId)
          ),
          JSON.stringify({
            id: "proc-status",
            projectId: pollutedProjectId,
            kind: "server",
            status: "stopped",
            command: "npm",
            args: ["run", "dev"],
            cwd: fixtureRoot,
            logPath: path.join(processDirectory, "proc-status.log"),
            internalDebugNote: "should not leak"
          })
        );

        const response = await app.inject({
          method: "GET",
          url: `/api/projects/${pollutedProjectId}/process`,
          headers
        });

        const body = response.json<{
          process: Record<string, unknown> | null;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.process?.id, "proc-status");
        assert.equal(
          body.process?.internalDebugNote,
          undefined
        );
      }
    );

    const stoppableProjectId = "polluted-project-stop";

    await context.test(
      "strips unexpected properties when stopping an already-stopped process",
      async () => {
        saveWorkspaceScan({
          workspaceId: pollutedWorkspaceId,
          workspacePath: fixtureRoot,
          projects: [
            {
              id: stoppableProjectId,
              name: "Polluted stop",
              path: fixtureRoot,
              type: "node",
              source: "workspace",
              favorite: false,
              capabilities: []
            } as never,
          ],
          warnings: []
        });

        await writeFile(
          path.join(
            processDirectory,
            processStateFileName(stoppableProjectId)
          ),
          JSON.stringify({
            id: "proc-stop",
            projectId: stoppableProjectId,
            kind: "server",
            status: "running",
            pid: 999_999,
            command: "npm",
            args: ["run", "dev"],
            cwd: fixtureRoot,
            logPath: path.join(processDirectory, "proc-stop.log"),
            internalDebugNote: "should not leak"
          })
        );

        const response = await app.inject({
          method: "POST",
          url: `/api/projects/${stoppableProjectId}/process/stop`,
          headers
        });

        const body = response.json<{
          process: Record<string, unknown>;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.process.status, "stopped");
        assert.equal(
          body.process.internalDebugNote,
          undefined
        );
      }
    );
  }
);
