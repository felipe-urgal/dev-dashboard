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
  scanWorkspace
} from "../src/index.js";

async function createRailsProject(
  projectPath: string
): Promise<void> {
  await Promise.all([
    mkdir(path.join(projectPath, ".git"), {
      recursive: true
    }),

    mkdir(path.join(projectPath, "config"), {
      recursive: true
    }),

    mkdir(path.join(projectPath, "spec"), {
      recursive: true
    })
  ]);

  await Promise.all([
    writeFile(
      path.join(projectPath, "Gemfile"),
      [
        'source "https://rubygems.org"',
        'gem "rails"',
        'gem "sidekiq"',
        ""
      ].join("\n")
    ),

    writeFile(
      path.join(projectPath, "Rakefile"),
      "require_relative \"config/application\"\n"
    ),

    writeFile(
      path.join(projectPath, "config/database.yml"),
      "development:\n  adapter: sqlite3\n"
    )
  ]);
}

async function createNodeProject(
  projectPath: string
): Promise<void> {
  await Promise.all([
    mkdir(path.join(projectPath, ".git"), {
      recursive: true
    }),

    mkdir(path.join(projectPath, "tests"), {
      recursive: true
    })
  ]);

  await writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(
      {
        name: "frontend-app",
        private: true,
        scripts: {
          dev: "vite",
          test: "node --test"
        },
        devDependencies: {
          vite: "^8.0.0",
          webpack: "^5.0.0"
        }
      },
      null,
      2
    )
  );
}

const workspacePath = await mkdtemp(
  path.join(
    tmpdir(),
    "dev-dashboard-discovery-"
  )
);

try {
  const railsPath = path.join(
    workspacePath,
    "backend-api"
  );

  const nodePath = path.join(
    workspacePath,
    "frontend-app"
  );

  await Promise.all([
    createRailsProject(railsPath),
    createNodeProject(nodePath),

    mkdir(
      path.join(workspacePath, "not-a-project"),
      {
        recursive: true
      }
    )
  ]);

  const result = await scanWorkspace({
    id: "fixture",
    path: workspacePath
  });

  assert.equal(result.workspaceId, "fixture");
  assert.equal(result.workspacePath, workspacePath);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.projects.length, 2);

  const railsProject = result.projects.find(
    (project) => project.name === "backend-api"
  );

  assert.ok(railsProject);
  assert.equal(railsProject.type, "rails");
  assert.equal(
    railsProject.workspaceId,
    "fixture"
  );

  assert.ok(
    railsProject.capabilities.includes("server")
  );

  assert.ok(
    railsProject.capabilities.includes("database")
  );

  assert.ok(
    railsProject.capabilities.includes("sidekiq")
  );

  assert.ok(
    railsProject.capabilities.includes("tests")
  );

  const nodeProject = result.projects.find(
    (project) => project.name === "frontend-app"
  );

  assert.ok(nodeProject);
  assert.equal(nodeProject.type, "node");

  assert.ok(
    nodeProject.capabilities.includes("server")
  );

  assert.ok(
    nodeProject.capabilities.includes("scripts")
  );

  assert.ok(
    nodeProject.capabilities.includes("tests")
  );

  assert.ok(
    nodeProject.capabilities.includes("webpack")
  );
} finally {
  await rm(workspacePath, {
    recursive: true,
    force: true
  });
}
