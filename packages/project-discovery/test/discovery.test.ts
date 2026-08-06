import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
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

const recursiveWorkspacePath = await mkdtemp(
  path.join(
    tmpdir(),
    "dev-dashboard-discovery-recursive-"
  )
);

try {
  const nestedRailsPath = path.join(
    recursiveWorkspacePath,
    "apps",
    "backend-api"
  );

  const nestedNodePath = path.join(
    recursiveWorkspacePath,
    "apps",
    "frontend-app"
  );

  await Promise.all([
    createRailsProject(nestedRailsPath),
    createNodeProject(nestedNodePath)
  ]);

  const nonRecursiveResult = await scanWorkspace({
    id: "fixture-recursive",
    path: recursiveWorkspacePath
  });

  assert.equal(
    nonRecursiveResult.projects.length,
    0,
    "sem recursive:true, projetos aninhados não devem ser detectados"
  );

  const recursiveResult = await scanWorkspace(
    {
      id: "fixture-recursive",
      path: recursiveWorkspacePath
    },
    {
      recursive: true
    }
  );

  assert.equal(recursiveResult.warnings.length, 0);
  assert.equal(recursiveResult.projects.length, 2);

  assert.ok(
    recursiveResult.projects.some(
      (project) => project.name === "backend-api" && project.type === "rails"
    )
  );

  assert.ok(
    recursiveResult.projects.some(
      (project) => project.name === "frontend-app" && project.type === "node"
    )
  );

  const depthLimitedResult = await scanWorkspace(
    {
      id: "fixture-recursive",
      path: recursiveWorkspacePath
    },
    {
      recursive: true,
      maxDepth: 0
    }
  );

  assert.equal(
    depthLimitedResult.projects.length,
    0,
    "maxDepth: 0 não deve descer além dos filhos diretos"
  );

  assert.ok(
    depthLimitedResult.warnings.some(
      (warning) => warning.code === "SCAN_DEPTH_LIMIT_REACHED"
    )
  );

  const projectLimitedResult = await scanWorkspace(
    {
      id: "fixture-recursive",
      path: recursiveWorkspacePath
    },
    {
      recursive: true,
      maxProjects: 1
    }
  );

  assert.equal(projectLimitedResult.projects.length, 1);

  assert.ok(
    projectLimitedResult.warnings.some(
      (warning) => warning.code === "SCAN_PROJECT_LIMIT_REACHED"
    )
  );

  const timedOutResult = await scanWorkspace(
    {
      id: "fixture-recursive",
      path: recursiveWorkspacePath
    },
    {
      recursive: true,
      timeoutMs: 0
    }
  );

  assert.equal(timedOutResult.projects.length, 0);

  assert.ok(
    timedOutResult.warnings.some(
      (warning) => warning.code === "SCAN_TIMEOUT"
    )
  );
} finally {
  await rm(recursiveWorkspacePath, {
    recursive: true,
    force: true
  });
}

const symlinkWorkspacePath = await mkdtemp(
  path.join(
    tmpdir(),
    "dev-dashboard-discovery-symlink-"
  )
);

try {
  const realProjectsDir = await mkdtemp(
    path.join(
      tmpdir(),
      "dev-dashboard-discovery-symlink-target-"
    )
  );

  try {
    const linkedRailsPath = path.join(
      realProjectsDir,
      "linked-backend"
    );

    await createRailsProject(linkedRailsPath);

    await symlink(
      linkedRailsPath,
      path.join(symlinkWorkspacePath, "linked-backend"),
      "dir"
    );

    const defaultResult = await scanWorkspace(
      {
        id: "fixture-symlink",
        path: symlinkWorkspacePath
      },
      {
        recursive: true
      }
    );

    assert.equal(
      defaultResult.projects.length,
      0,
      "por padrão, links simbólicos não devem ser seguidos na varredura recursiva"
    );

    const followSymlinksResult = await scanWorkspace(
      {
        id: "fixture-symlink",
        path: symlinkWorkspacePath
      },
      {
        recursive: true,
        followSymlinks: true
      }
    );

    assert.equal(followSymlinksResult.projects.length, 1);
  } finally {
    await rm(realProjectsDir, {
      recursive: true,
      force: true
    });
  }
} finally {
  await rm(symlinkWorkspacePath, {
    recursive: true,
    force: true
  });
}
