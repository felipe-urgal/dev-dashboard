import assert from "node:assert/strict";

import { spawn } from "node:child_process";

import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
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
  logDirectory: string;
  cleanup: () => Promise<void>;
}

async function createFixture(): Promise<Fixture> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "dev-dashboard-log-retention-")
  );

  const stateDirectory = path.join(fixtureRoot, "state");
  const processDirectory = path.join(stateDirectory, "processes");
  const logDirectory = path.join(stateDirectory, "logs");

  await Promise.all([
    mkdir(processDirectory, { recursive: true }),
    mkdir(logDirectory, { recursive: true })
  ]);

  return {
    stateDirectory,
    processDirectory,
    logDirectory,
    cleanup: async () => {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  };
}

async function writeStateFile(
  fixture: Fixture,
  fileName: string,
  storedProcess: Record<string, unknown>
): Promise<{ stateFilePath: string; logPath: string }> {
  const stateFilePath = path.join(fixture.processDirectory, fileName);
  const logPath = path.join(
    fixture.logDirectory,
    fileName.replace(/\.server\.json$/, ".server.log")
  );

  await writeFile(logPath, "log de exemplo\n");
  await writeFile(
    stateFilePath,
    JSON.stringify({
      ...storedProcess,
      logPath
    })
  );

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
      fixture,
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
      fixture,
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
  "removes a recent stopped process when all terminal states are requested",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const oneMinuteAgo = new Date(
      Date.now() - 60_000
    ).toISOString();

    const { stateFilePath, logPath } = await writeStateFile(
      fixture,
      "recent-terminal.server.json",
      {
        id: "recent-terminal:server",
        projectId: "recent-terminal-project",
        kind: "server",
        status: "stopped",
        stoppedAt: oneMinuteAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory
      }
    );

    const removed = await sweepStaleProcesses(
      fixture.stateDirectory,
      {
        removeAllTerminal: true
      }
    );

    assert.deepEqual(removed, [
      { projectId: "recent-terminal-project" }
    ]);
    await assert.rejects(stat(stateFilePath));
    await assert.rejects(stat(logPath));
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

    await writeStateFile(fixture, "failed.server.json", {
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
      fixture,
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

test(
  "skips a corrupt state file and still removes a valid stale process",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    await writeFile(
      path.join(fixture.processDirectory, "garbage.server.json"),
      "isto não é json{{{"
    );

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    await writeStateFile(fixture, "old.server.json", {
      id: "old:server",
      projectId: "old-project",
      kind: "server",
      status: "stopped",
      stoppedAt: eightDaysAgo,
      command: "npm",
      args: ["run", "dev"],
      cwd: fixture.stateDirectory,
      logPath: path.join(fixture.processDirectory, "old.server.json.log")
    });

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "old-project");
  }
);

test(
  "removes an orphaned log older than the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const orphanLogPath = path.join(
      fixture.logDirectory,
      "orphan.server.log"
    );

    await writeFile(orphanLogPath, "log órfão\n");

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(orphanLogPath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.deepEqual(removed, [{ logFile: "orphan.server.log" }]);
    await assert.rejects(stat(orphanLogPath));
  }
);

test(
  "keeps a recent orphaned log within the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const orphanLogPath = path.join(
      fixture.logDirectory,
      "orphan.server.log"
    );

    await writeFile(orphanLogPath, "log órfão recente\n");

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.deepEqual(removed, []);
    await stat(orphanLogPath);
  }
);

test(
  "removes a recent orphaned log when all terminal states are requested",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const orphanLogPath = path.join(
      fixture.logDirectory,
      "orphan.test.log"
    );

    await writeFile(orphanLogPath, "log órfão de teste\n");

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      removeAllTerminal: true
    });

    assert.deepEqual(removed, [{ logFile: "orphan.test.log" }]);
    await assert.rejects(stat(orphanLogPath));
  }
);

test(
  "keeps a log that still has a matching state file, even if invalid",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const logPath = path.join(
      fixture.logDirectory,
      "garbage.server.log"
    );

    await writeFile(logPath, "log de estado corrompido\n");

    await writeFile(
      path.join(fixture.processDirectory, "garbage.server.json"),
      "isto não é json{{{"
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(logPath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.deepEqual(removed, []);
    await stat(logPath);
  }
);

function waitForExit(pid: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    const check = () => {
      try {
        process.kill(pid, 0);
      } catch {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        resolve();
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
}

test(
  "removes a process marked running whose PID has already died",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const child = spawn("node", ["-e", "process.exit(0)"], {
      detached: true,
      stdio: "ignore"
    });

    const pid = child.pid;

    assert.ok(pid);

    child.unref();

    await waitForExit(pid as number, 2_000);

    const { stateFilePath } = await writeStateFile(
      fixture,
      "dead.server.json",
      {
        id: "dead:server",
        projectId: "dead-project",
        kind: "server",
        status: "running",
        pid,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(
          fixture.processDirectory,
          "dead.server.json.log"
        )
      }
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(stateFilePath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "dead-project");
  }
);

test(
  "keeps a process that is genuinely running when all terminal states are requested",
  async (context) => {
    const fixture = await createFixture();

    let pid: number | undefined;

    context.after(async () => {
      if (pid !== undefined) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // já encerrado
        }
      }

      await fixture.cleanup();
    });

    const projectCwd = await realpath(fixture.stateDirectory);

    const child = spawn(
      "node",
      ["-e", "setInterval(() => {}, 60000)"],
      {
        cwd: projectCwd,
        detached: true,
        stdio: "ignore"
      }
    );

    pid = child.pid;

    assert.ok(pid);

    child.unref();

    const { stateFilePath } = await writeStateFile(
      fixture,
      "alive.server.json",
      {
        id: "alive:server",
        projectId: "alive-project",
        kind: "server",
        status: "running",
        pid,
        command: "npm",
        args: ["run", "dev"],
        cwd: projectCwd,
        logPath: path.join(
          fixture.processDirectory,
          "alive.server.json.log"
        )
      }
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(stateFilePath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      removeAllTerminal: true
    });

    assert.equal(removed.length, 0);
  }
);

test(
  "never removes a log path outside the managed logs directory",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const protectedFile = path.join(
      path.dirname(fixture.stateDirectory),
      "protected.txt"
    );

    await writeFile(protectedFile, "não remover\n");

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    const stateFilePath = path.join(
      fixture.processDirectory,
      "malicious.server.json"
    );

    await writeFile(
      stateFilePath,
      JSON.stringify({
        id: "malicious:server",
        projectId: "malicious-project",
        kind: "server",
        status: "stopped",
        stoppedAt: eightDaysAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: protectedFile
      })
    );

    const removed = await sweepStaleProcesses(
      fixture.stateDirectory,
      {
        maxAgeMs: 7 * DAY_IN_MS
      }
    );

    assert.equal(removed.length, 1);
    assert.equal(
      await readFile(protectedFile, "utf8"),
      "não remover\n"
    );
  }
);
