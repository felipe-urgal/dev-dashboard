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

async function configureHttpServer(
  fixture: Fixture,
): Promise<void> {
  await Promise.all([
    writeFile(
      path.join(fixture.project.path, "server.js"),
      [
        "const http = require('node:http');",
        "const port = Number(process.env.PORT);",
        "const host = process.env.HOST || '127.0.0.1';",
        "http.createServer((_request, response) => response.end('ok')).listen(port, host);",
        ""
      ].join("\n")
    ),
    writeFile(
      path.join(fixture.project.path, "package.json"),
      JSON.stringify({
        name: "fixture",
        scripts: { dev: "node server.js" }
      })
    )
  ]);
}

async function waitForStatus(
  fixture: Fixture,
  status: string,
): Promise<Awaited<ReturnType<ProcessManager["getServerProcess"]>>> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const managedProcess = await fixture.manager.getServerProcess(
      fixture.project.id
    );

    if (managedProcess?.status === status) {
      return managedProcess;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`O processo não alcançou o estado ${status}.`);
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

    await configureHttpServer(fixture);

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    assert.equal(started.status, "starting");
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

    const running = await waitForStatus(fixture, "running");

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
  "detects a process that exits during startup and marks it failed",
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

    assert.equal(detected?.status, "failed");
    assert.equal(detected?.pid, undefined);
    assert.equal(detected?.exitCode, 0);
    assert.ok(detected?.stoppedAt);
  }
);

test(
  "records a non-zero exit after the server was running",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node server.js" }
    });

    await writeFile(
      path.join(fixture.project.path, "server.js"),
      [
        "const http = require('node:http');",
        "const server = http.createServer((_request, response) => response.end('ok'));",
        "server.listen(Number(process.env.PORT), process.env.HOST, () => {",
        "  setTimeout(() => process.exit(7), 500);",
        "});",
        ""
      ].join("\n")
    );

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const started = await fixture.manager.startServer(fixture.project);
    startedPid = started.pid;

    const running = await waitForStatus(fixture, "running");
    assert.equal(running?.status, "running");

    const failed = await waitForStatus(fixture, "failed");

    assert.equal(failed?.exitCode, 7);
    assert.equal(failed?.pid, undefined);
    assert.ok(failed?.stoppedAt);
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

    assert.equal(started.status, "starting");

    await fixture.manager.stopServer(fixture.project.id);
  }
);

test(
  "serializes concurrent startTest invocations",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { test: "node -e \"process.exit(0)\"" }
    });

    context.after(fixture.cleanup);

    const command = {
      id: "node-script-test",
      command: "node",
      args: ["-e", "setInterval(() => {}, 60_000)"]
    };

    const results = await Promise.allSettled([
      fixture.manager.startTest(fixture.project, command),
      fixture.manager.startTest(fixture.project, command)
    ]);

    const fulfilled = results.filter((entry) => entry.status === "fulfilled");
    const rejected = results.filter((entry) => entry.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const rejection = rejected[0];
    assert.ok(rejection && rejection.status === "rejected");
    assert.ok(rejection.reason instanceof ProcessManagerError);
    assert.equal(
      (rejection.reason as ProcessManagerError).code,
      "PROCESS_ALREADY_RUNNING"
    );

    const success = fulfilled[0];
    assert.ok(success && success.status === "fulfilled");
    await fixture.manager.stopTest(fixture.project.id);
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

test(
  "starts, reports and stops a worker process (sidekiq-like)",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    context.after(fixture.cleanup);

    const command = {
      id: "sidekiq",
      command: "node",
      args: ["-e", "setInterval(() => {}, 60_000)"]
    };

    const started = await fixture.manager.startWorker(
      fixture.project,
      "worker",
      command
    );

    assert.equal(started.kind, "worker");
    assert.equal(started.status, "running");
    assert.ok(started.pid);

    const fetched = await fixture.manager.getWorkerProcess(
      fixture.project.id,
      "worker"
    );

    assert.equal(fetched?.pid, started.pid);

    const stopped = await fixture.manager.stopWorker(
      fixture.project.id,
      "worker"
    );

    assert.equal(stopped.status, "stopped");
  }
);

test(
  "keeps sidekiq and webpack workers as independent processes for the same project",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    context.after(fixture.cleanup);

    const sidekiqCommand = {
      id: "sidekiq",
      command: "node",
      args: ["-e", "setInterval(() => {}, 60_000)"]
    };

    const webpackCommand = {
      id: "webpack",
      command: "node",
      args: ["-e", "setInterval(() => {}, 60_000)"]
    };

    const [sidekiqProcess, webpackProcess] = await Promise.all([
      fixture.manager.startWorker(fixture.project, "worker", sidekiqCommand),
      fixture.manager.startWorker(fixture.project, "webpack", webpackCommand)
    ]);

    assert.notEqual(sidekiqProcess.pid, webpackProcess.pid);

    await fixture.manager.stopWorker(fixture.project.id, "worker");
    await fixture.manager.stopWorker(fixture.project.id, "webpack");

    const remainingWebpack = await fixture.manager.getWorkerProcess(
      fixture.project.id,
      "webpack"
    );

    assert.equal(remainingWebpack?.status, "stopped");
  }
);

test(
  "rejects starting a worker that is already running",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    context.after(fixture.cleanup);

    const command = {
      id: "sidekiq",
      command: "node",
      args: ["-e", "setInterval(() => {}, 60_000)"]
    };

    await fixture.manager.startWorker(fixture.project, "worker", command);

    context.after(async () => {
      await fixture.manager.stopWorker(fixture.project.id, "worker").catch(() => undefined);
    });

    await assert.rejects(
      fixture.manager.startWorker(fixture.project, "worker", command),
      (error: unknown) => {
        assert.ok(error instanceof ProcessManagerError);
        assert.equal(error.code, "PROCESS_ALREADY_RUNNING");
        return true;
      }
    );
  }
);
