import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  rm
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

  const storedWorkspace =
    await repository.find(workspace.id);

  assert.deepEqual(
    storedWorkspace,
    workspace
  );

  const workspaces = await repository.list();

  assert.equal(workspaces.length, 1);
  assert.deepEqual(workspaces[0], workspace);

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
