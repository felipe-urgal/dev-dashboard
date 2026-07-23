import {
  spawn
} from "node:child_process";

const npmCommand =
  process.platform === "win32"
    ? "npm.cmd"
    : "npm";

const processDefinitions = [
  {
    name: "api",
    args: [
      "run",
      "dev:api"
    ]
  },
  {
    name: "web",
    args: [
      "run",
      "dev:web"
    ]
  }
];

const children = [];
let shuttingDown = false;

function stopChild(child, signal) {
  if (!child.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill(signal);
      return;
    }

    process.kill(-child.pid, signal);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return;
    }

    console.error(
      "Falha ao encerrar processo de desenvolvimento:",
      error
    );
  }
}

function shutdown(
  signal,
  exitCode = 0
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    stopChild(child, signal);
  }

  setTimeout(() => {
    for (const child of children) {
      stopChild(child, "SIGKILL");
    }

    process.exit(exitCode);
  }, 1_000).unref();
}

for (const definition of processDefinitions) {
  const child = spawn(
    npmCommand,
    definition.args,
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
      detached: process.platform !== "win32",
      env: process.env
    }
  );

  children.push(child);

  child.once("error", (error) => {
    console.error(
      `Não foi possível iniciar ${definition.name}:`,
      error
    );

    shutdown("SIGTERM", 1);
  });

  child.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(
      `${definition.name} foi encerrado`,
      {
        code,
        signal
      }
    );

    shutdown(
      "SIGTERM",
      code === 0 ? 0 : 1
    );
  });
}

process.once("SIGINT", () => {
  shutdown("SIGTERM", 0);
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM", 0);
});
