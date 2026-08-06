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
  WorkspaceRepository,
  WorkspaceRepositoryError
} from "../src/index.js";

const fixtureRoot = await mkdtemp(
  path.join(
    tmpdir(),
    "dev-dashboard-core-"
  )
);

const configDirectory = path.join(
  fixtureRoot,
  "config"
);

const workspacePath = path.join(
  fixtureRoot,
  "projects"
);

try {
  await mkdir(workspacePath, {
    recursive: true
  });

  await mkdir(path.join(fixtureRoot, "monorepo"), {
    recursive: true
  });

  const repository =
    new WorkspaceRepository(configDirectory);

  assert.deepEqual(
    await repository.list(),
    []
  );

  const workspace = await repository.create({
    name: "Projetos Pessoais",
    path: workspacePath
  });

  assert.equal(
    workspace.id,
    "projetos-pessoais"
  );

  assert.equal(
    workspace.name,
    "Projetos Pessoais"
  );

  assert.equal(
    workspace.path,
    workspacePath
  );

  assert.equal(
    workspace.enabled,
    true
  );

  assert.equal(
    workspace.recursiveScan,
    false
  );

  const workspaceWithRecursiveScan = await repository.create({
    name: "Monorepo",
    path: path.join(fixtureRoot, "monorepo"),
    recursiveScan: true
  });

  assert.equal(
    workspaceWithRecursiveScan.recursiveScan,
    true
  );

  const updatedWorkspace = await repository.setRecursiveScan(
    workspace.id,
    true
  );

  assert.equal(updatedWorkspace.recursiveScan, true);

  assert.equal(
    (await repository.find(workspace.id))?.recursiveScan,
    true
  );

  await assert.rejects(
    repository.setRecursiveScan("workspace-inexistente", true),
    (error: unknown) => {
      assert.ok(
        error instanceof WorkspaceRepositoryError
      );

      assert.equal(
        error.code,
        "WORKSPACE_NOT_FOUND"
      );

      return true;
    }
  );

  await repository.remove(workspaceWithRecursiveScan.id);

  const storedWorkspace =
    await repository.find(workspace.id);

  assert.deepEqual(
    storedWorkspace,
    updatedWorkspace
  );

  const workspaces = await repository.list();

  assert.equal(workspaces.length, 1);
  assert.deepEqual(workspaces[0], updatedWorkspace);

  await assert.rejects(
    repository.create({
      name: "Duplicado",
      path: workspacePath
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof WorkspaceRepositoryError
      );

      assert.equal(
        error.code,
        "WORKSPACE_ALREADY_EXISTS"
      );

      return true;
    }
  );

  await repository.remove(workspace.id);

  assert.deepEqual(
    await repository.list(),
    []
  );

  assert.equal(
    await repository.find(workspace.id),
    null
  );

  await assert.rejects(
    repository.remove(workspace.id),
    (error: unknown) => {
      assert.ok(
        error instanceof WorkspaceRepositoryError
      );

      assert.equal(
        error.code,
        "WORKSPACE_NOT_FOUND"
      );

      return true;
    }
  );
} finally {
  await rm(fixtureRoot, {
    recursive: true,
    force: true
  });
}

const legacyFixtureRoot = await mkdtemp(
  path.join(
    tmpdir(),
    "dev-dashboard-core-legacy-"
  )
);

try {
  const legacyConfigDirectory = path.join(
    legacyFixtureRoot,
    "config"
  );

  await mkdir(legacyConfigDirectory, {
    recursive: true
  });

  await writeFile(
    path.join(legacyConfigDirectory, "config.json"),
    JSON.stringify({
      version: 1,
      workspaces: [
        {
          id: "legado",
          name: "Legado",
          path: legacyFixtureRoot,
          enabled: true
        }
      ]
    }),
    "utf8"
  );

  const legacyRepository = new WorkspaceRepository(
    legacyConfigDirectory
  );

  const legacyWorkspaces = await legacyRepository.list();

  assert.equal(legacyWorkspaces.length, 1);
  assert.equal(legacyWorkspaces[0]?.recursiveScan, false);

  assert.equal(
    (await legacyRepository.find("legado"))?.recursiveScan,
    false
  );
} finally {
  await rm(legacyFixtureRoot, {
    recursive: true,
    force: true
  });
}
