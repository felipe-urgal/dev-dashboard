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
  "POST /api/processes/cleanup removes stale process state and logs",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "dev-dashboard-api-cleanup-")
    );

    const stateDirectory = path.join(fixtureRoot, "state");
    const processDirectory = path.join(stateDirectory, "processes");

    const previousStateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR;

    process.env.DEV_DASHBOARD_STATE_DIR = stateDirectory;

    await mkdir(processDirectory, { recursive: true });

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
        logPath: path.join(processDirectory, "stale.server.json.log")
      })
    );

    await writeFile(
      path.join(processDirectory, "stale.server.json.log"),
      "log antigo\n"
    );

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

    const response = await app.inject({
      method: "POST",
      url: "/api/processes/cleanup",
      headers: { "x-dev-dashboard-token": TOKEN }
    });

    const body = response.json<{
      removed: Array<{ projectId: string }>;
    }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.removed.length, 1);
    assert.equal(body.removed[0]?.projectId, "stale-project");
  }
);
