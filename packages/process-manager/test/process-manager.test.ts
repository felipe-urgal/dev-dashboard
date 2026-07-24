import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import { createServer } from "node:net";

import {
  tmpdir
} from "node:os";

import path from "node:path";

import {
  test
} from "node:test";

import type {
  Project
} from "@dev-dashboard/contracts";

import {
  ProcessManager,
  ProcessManagerError
} from "../src/index.js";

interface Fixture {
  stateDirectory: string;
  project: Project;
  manager: ProcessManager;
  cleanup: () => Promise<void>;
}

async function createFixture(
  packageJson: Record<string, unknown>
): Promise<Fixture> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "dev-dashboard-process-manager-")
  );

  const stateDirectory = path.join(fixtureRoot, "state");
  const projectPath = path.join(fixtureRoot, "project");

  await mkdir(projectPath, { recursive: true });

  await writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  const project: Project = {
    id: "fixture-project",
    name: "Fixture",
    path: projectPath,
    type: "node",
    source: "workspace",
    favorite: false,
    capabilities: []
  };

  return {
    stateDirectory,
    project,
    manager: new ProcessManager(stateDirectory),
    cleanup: async () => {
      await rm(fixtureRoot, {
        recursive: true,
        force: true
      });
    }
  };
}

function killIfAlive(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone; nothing to clean up
  }
}

test(
  "returns null when no process was ever started for a project",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    context.after(fixture.cleanup);

    const managedProcess = await fixture.manager.getServerProcess(
      fixture.project.id
    );

    assert.equal(managedProcess, null);
  }
);

test(
  "rejects reading logs without a stored process",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: {}
    });

    context.after(fixture.cleanup);

    await assert.rejects(
      fixture.manager.readServerLog(fixture.project.id),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "PROCESS_NOT_FOUND");
        return true;
      }
    );
  }
);

test(
  "rejects starting a server for an unsupported project type",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: {}
    });

    context.after(fixture.cleanup);

    await assert.rejects(
      fixture.manager.startServer({
        ...fixture.project,
        type: "unknown"
      }),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "PROJECT_SERVER_UNSUPPORTED");
        return true;
      }
    );
  }
);

test(
  "rejects starting a node server without a dev, start or serve script",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { test: "echo not-a-server-script" }
    });

    context.after(fixture.cleanup);

    await assert.rejects(
      fixture.manager.startServer(fixture.project),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "PROJECT_SCRIPT_NOT_FOUND");
        return true;
      }
    );
  }
);

test(
  "rejects starting a server on an out-of-range port without spawning anything",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    context.after(fixture.cleanup);

    await assert.rejects(
      fixture.manager.startServer(fixture.project, { port: 70_000 }),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "INVALID_PORT");
        return true;
      }
    );

    const managedProcess = await fixture.manager.getServerProcess(
      fixture.project.id
    );

    assert.equal(managedProcess, null);
  }
);

test(
  "starts, tracks and stops a real node server",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    assert.equal(started.status, "running");
    assert.equal(started.projectId, fixture.project.id);
    assert.ok(started.pid && started.pid > 0);
    assert.ok(started.port && started.port >= 1_024 && started.port <= 65_535);
    const expectedUrl = `http://localhost:${started.port}`;

    assert.equal(started.url, expectedUrl);
    assert.ok(started.urls?.includes(expectedUrl));
    assert.equal(started.command, "npm");

    process.kill(started.pid as number, 0);

    await assert.rejects(
      fixture.manager.startServer(fixture.project),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "PROCESS_ALREADY_RUNNING");
        return true;
      }
    );

    const running = await fixture.manager.getServerProcess(
      fixture.project.id
    );

    assert.equal(running?.status, "running");
    assert.equal(running?.pid, started.pid);

    const stopped = await fixture.manager.stopServer(fixture.project.id);

    assert.equal(stopped.status, "stopped");
    assert.ok(stopped.stoppedAt);

    assert.throws(() => {
      process.kill(started.pid as number, 0);
    });

    const stoppedAgain = await fixture.manager.stopServer(
      fixture.project.id
    );

    assert.equal(stoppedAgain.status, "stopped");
  }
);

test(
  "captures server stdout in the log file",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: {
        dev: "node -e \"console.log('server ready'); setInterval(() => {}, 60000)\""
      }
    });

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    assert.ok(started.logPath);

    let content = "";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      content = await readFile(started.logPath as string, "utf8");

      if (content.includes("server ready")) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.match(content, /server ready/);

    const snapshot = await fixture.manager.readServerLog(
      fixture.project.id
    );

    assert.match(snapshot.content, /server ready/);
    assert.equal(snapshot.truncated, false);
    assert.ok(snapshot.sizeBytes > 0);

    await fixture.manager.stopServer(fixture.project.id);
  }
);

test(
  "truncates long logs and drops the leading partial line",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: {
        dev:
          "node -e \"for (let i = 0; i < 200; i += 1) { " +
          "console.log('line-' + i + '-' + 'x'.repeat(40)); } " +
          "setInterval(() => {}, 60000)\""
      }
    });

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    let fullLog = "";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      fullLog = await readFile(started.logPath as string, "utf8");

      if (fullLog.includes("line-199-")) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.match(fullLog, /line-199-/);

    const snapshot = await fixture.manager.readServerLog(
      fixture.project.id,
      { maxBytes: 512 }
    );

    assert.equal(snapshot.truncated, true);
    assert.equal(snapshot.content.startsWith("line-"), true);
    assert.ok(snapshot.content.length <= 512);
    assert.match(snapshot.content, /line-199-/);

    await fixture.manager.stopServer(fixture.project.id);
  }
);

test(
  "rejects an out-of-range log limit for a known process",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    await assert.rejects(
      fixture.manager.readServerLog(fixture.project.id, {
        maxBytes: 0
      }),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "INVALID_LOG_LIMIT");
        return true;
      }
    );

    await assert.rejects(
      fixture.manager.readServerLog(fixture.project.id, {
        maxBytes: 300_000
      }),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "INVALID_LOG_LIMIT");
        return true;
      }
    );

    await fixture.manager.stopServer(fixture.project.id);
  }
);

test(
  "detects a process that is no longer alive and marks it stopped",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: {
        dev: "node -e \"process.exit(0)\""
      }
    });

    context.after(fixture.cleanup);

    const started = await fixture.manager.startServer(fixture.project);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        process.kill(started.pid as number, 0);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch {
        break;
      }
    }

    assert.throws(() => {
      process.kill(started.pid as number, 0);
    });

    const detected = await fixture.manager.getServerProcess(
      fixture.project.id
    );

    assert.equal(detected?.status, "stopped");
    assert.ok(detected?.stoppedAt);
  }
);

test(
  "starts a server even when the log sweep finds a corrupted state file",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const processDirectory = path.join(
      fixture.stateDirectory,
      "processes"
    );

    await mkdir(processDirectory, { recursive: true });

    await writeFile(
      path.join(processDirectory, "garbage.server.json"),
      "isto não é json{{{"
    );

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    assert.equal(started.status, "running");

    await fixture.manager.stopServer(fixture.project.id);
  }
);

test(
  "rejects a configured port that is already occupied",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    context.after(fixture.cleanup);

    const server = createServer();

    context.after(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(
        {
          host: "127.0.0.1",
          port: 0
        },
        () => resolve()
      );
    });

    const address = server.address();

    assert.ok(address && typeof address === "object");

    await assert.rejects(
      fixture.manager.startServer(
        fixture.project,
        {
          port: address.port
        }
      ),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "PORT_NOT_AVAILABLE");
        return true;
      }
    );
  }
);
