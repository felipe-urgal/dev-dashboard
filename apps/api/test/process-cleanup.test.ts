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

const TOKEN = "e".repeat(64);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

test(
  "POST /api/processes/cleanup",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "dev-dashboard-api-cleanup-")
    );

    const stateDirectory = path.join(fixtureRoot, "state");
    const processDirectory = path.join(stateDirectory, "processes");
    const logDirectory = path.join(stateDirectory, "logs");

    const previousStateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR;

    process.env.DEV_DASHBOARD_STATE_DIR = stateDirectory;

    await Promise.all([
      mkdir(processDirectory, { recursive: true }),
      mkdir(logDirectory, { recursive: true })
    ]);

    // O `ProcessManager` usado pelas rotas é um singleton de módulo cujo
    // `stateDirectory` é fixado no primeiro `buildApp()` importado neste
    // processo; por isso este arquivo constrói o app uma única vez e reusa
    // a mesma fixture entre os subtestes, em vez de reimportar `app.js`.
    const { buildApp } = await import("../src/app.js");

    const app = await buildApp({ localToken: TOKEN });

    context.after(async () => {
      await app.close();

      if (previousStateDirectory === undefined) {
        delete process.env.DEV_DASHBOARD_STATE_DIR;
      } else {
        process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
      }

      await rm(fixtureRoot, { recursive: true, force: true });
    });

    const headers = { "x-dev-dashboard-token": TOKEN };

    await context.test(
      "removes stale process state and logs",
      async () => {
        const eightDaysAgo = new Date(
          Date.now() - 8 * DAY_IN_MS
        ).toISOString();

        await writeFile(
          path.join(processDirectory, "stale.server.json"),
          JSON.stringify({
            id: "stale:server",
            projectId: "stale-project",
            kind: "server",
            status: "stopped",
            stoppedAt: eightDaysAgo,
            command: "npm",
            args: ["run", "dev"],
            cwd: fixtureRoot,
            logPath: path.join(logDirectory, "stale.server.log")
          })
        );

        await writeFile(
          path.join(logDirectory, "stale.server.log"),
          "log antigo\n"
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/processes/cleanup",
          headers
        });

        const body = response.json<{
          removed: Array<{ projectId: string }>;
          removedCount: number;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.removed.length, 1);
        assert.equal(body.removedCount, 1);
        assert.equal(body.removed[0]?.projectId, "stale-project");
        assert.equal("logPath" in (body.removed[0] ?? {}), false);
      }
    );

    await context.test(
      "skips a corrupt state file and still removes a valid stale process",
      async () => {
        await writeFile(
          path.join(processDirectory, "garbage.server.json"),
          "isto não é json{{{"
        );

        const eightDaysAgo = new Date(
          Date.now() - 8 * DAY_IN_MS
        ).toISOString();

        await writeFile(
          path.join(processDirectory, "stale-2.server.json"),
          JSON.stringify({
            id: "stale-2:server",
            projectId: "stale-project-2",
            kind: "server",
            status: "stopped",
            stoppedAt: eightDaysAgo,
            command: "npm",
            args: ["run", "dev"],
            cwd: fixtureRoot,
            logPath: path.join(logDirectory, "stale-2.server.log")
          })
        );

        await writeFile(
          path.join(logDirectory, "stale-2.server.log"),
          "log antigo\n"
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/processes/cleanup",
          headers
        });

        const body = response.json<{
          removed: Array<{ projectId: string }>;
          removedCount: number;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.removed.length, 1);
        assert.equal(body.removedCount, 1);
        assert.equal(body.removed[0]?.projectId, "stale-project-2");
      }
    );

    await context.test(
      "removes recent terminal states without waiting for retention",
      async () => {
        const oneMinuteAgo = new Date(
          Date.now() - 60_000
        ).toISOString();

        await writeFile(
          path.join(processDirectory, "recent.test.json"),
          JSON.stringify({
            id: "recent:test",
            projectId: "recent-project",
            kind: "test",
            status: "failed",
            stoppedAt: oneMinuteAgo,
            command: "npm",
            args: ["test"],
            cwd: fixtureRoot,
            logPath: path.join(logDirectory, "recent.test.log")
          })
        );

        await writeFile(
          path.join(logDirectory, "recent.test.log"),
          "falha recente\n"
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/processes/cleanup",
          headers
        });

        const body = response.json<{
          removed: Array<{ projectId: string }>;
          removedCount: number;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.removedCount, 1);
        assert.equal(body.removed[0]?.projectId, "recent-project");
      }
    );

    await context.test(
      "removes an orphaned log without a matching state file",
      async () => {
        await writeFile(
          path.join(logDirectory, "orphan.server.log"),
          "log sem estado correspondente\n"
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/processes/cleanup",
          headers
        });

        const body = response.json<{
          removed: Array<{ projectId?: string; logFile?: string }>;
          removedCount: number;
        }>();

        assert.equal(response.statusCode, 200);
        assert.equal(body.removedCount, 1);
        assert.equal(body.removed[0]?.logFile, "orphan.server.log");
        assert.equal(body.removed[0]?.projectId, undefined);
      }
    );
  }
);
