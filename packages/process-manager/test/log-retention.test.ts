import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  utimes,
  writeFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import path from "node:path";

import {
  test
} from "node:test";

import {
  sweepStaleProcesses
} from "../src/log-retention.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface Fixture {
  stateDirectory: string;
  processDirectory: string;
  cleanup: () => Promise<void>;
}

async function createFixture(): Promise<Fixture> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "dev-dashboard-log-retention-")
  );

  const stateDirectory = path.join(fixtureRoot, "state");
  const processDirectory = path.join(stateDirectory, "processes");

  await mkdir(processDirectory, { recursive: true });

  return {
    stateDirectory,
    processDirectory,
    cleanup: async () => {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  };
}

async function writeStateFile(
  processDirectory: string,
  fileName: string,
  storedProcess: Record<string, unknown>
): Promise<{ stateFilePath: string; logPath: string }> {
  const stateFilePath = path.join(processDirectory, fileName);
  const logPath = path.join(processDirectory, `${fileName}.log`);

  await writeFile(logPath, "log de exemplo\n");
  await writeFile(stateFilePath, JSON.stringify(storedProcess));

  return { stateFilePath, logPath };
}

test(
  "removes a stopped process older than the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    const { stateFilePath, logPath } = await writeStateFile(
      fixture.processDirectory,
      "old.server.json",
      {
        id: "old:server",
        projectId: "old-project",
        kind: "server",
        status: "stopped",
        stoppedAt: eightDaysAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(fixture.processDirectory, "old.server.json.log")
      }
    );

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "old-project");

    await assert.rejects(stat(stateFilePath));
    await assert.rejects(stat(logPath));
  }
);

test(
  "keeps a stopped process within the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const oneDayAgo = new Date(Date.now() - DAY_IN_MS).toISOString();

    const { stateFilePath, logPath } = await writeStateFile(
      fixture.processDirectory,
      "recent.server.json",
      {
        id: "recent:server",
        projectId: "recent-project",
        kind: "server",
        status: "stopped",
        stoppedAt: oneDayAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(
          fixture.processDirectory,
          "recent.server.json.log"
        )
      }
    );

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 0);
    await stat(stateFilePath);
    await stat(logPath);
  }
);

test(
  "removes a failed process older than the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    await writeStateFile(fixture.processDirectory, "failed.server.json", {
      id: "failed:server",
      projectId: "failed-project",
      kind: "server",
      status: "failed",
      stoppedAt: eightDaysAgo,
      command: "npm",
      args: ["run", "dev"],
      cwd: fixture.stateDirectory,
      logPath: path.join(
        fixture.processDirectory,
        "failed.server.json.log"
      )
    });

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "failed-project");
  }
);

test(
  "falls back to the state file's mtime when stoppedAt is missing",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const { stateFilePath } = await writeStateFile(
      fixture.processDirectory,
      "no-timestamp.server.json",
      {
        id: "no-timestamp:server",
        projectId: "no-timestamp-project",
        kind: "server",
        status: "stopped",
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(
          fixture.processDirectory,
          "no-timestamp.server.json.log"
        )
      }
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(stateFilePath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "no-timestamp-project");
  }
);

test(
  "returns an empty list when the processes directory does not exist",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "dev-dashboard-log-retention-empty-")
    );

    context.after(async () => {
      await rm(fixtureRoot, { recursive: true, force: true });
    });

    const removed = await sweepStaleProcesses(
      path.join(fixtureRoot, "state")
    );

    assert.deepEqual(removed, []);
  }
);
