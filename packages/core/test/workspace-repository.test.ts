import assert from 'node:assert/strict';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { WorkspaceRepository, WorkspaceRepositoryError } from '../src/index.js';

const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-core-'));

const configDirectory = path.join(fixtureRoot, 'config');

const workspacePath = path.join(fixtureRoot, 'projects');

try {
  await mkdir(workspacePath, {
    recursive: true,
  });

  await mkdir(path.join(fixtureRoot, 'monorepo'), {
    recursive: true,
  });

  const repository = new WorkspaceRepository(configDirectory);

  assert.deepEqual(await repository.list(), []);

  const workspace = await repository.create({
    name: 'Projetos Pessoais',
    path: workspacePath,
  });

  assert.equal(workspace.id, 'projetos-pessoais');

  assert.equal(workspace.name, 'Projetos Pessoais');

  assert.equal(workspace.path, workspacePath);

  assert.equal(workspace.enabled, true);

  assert.equal(workspace.recursiveScan, false);

  const workspaceWithRecursiveScan = await repository.create({
    name: 'Monorepo',
    path: path.join(fixtureRoot, 'monorepo'),
    recursiveScan: true,
  });

  assert.equal(workspaceWithRecursiveScan.recursiveScan, true);

  const updatedWorkspace = await repository.setRecursiveScan(
    workspace.id,
    true,
  );

  assert.equal(updatedWorkspace.recursiveScan, true);

  assert.equal((await repository.find(workspace.id))?.recursiveScan, true);

  const renamedWorkspace = await repository.update(workspace.id, {
    name: 'Projetos Renomeados',
  });

  assert.equal(renamedWorkspace.name, 'Projetos Renomeados');
  assert.equal(renamedWorkspace.recursiveScan, true);

  await assert.rejects(
    repository.update(workspace.id, { name: '   ' }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceRepositoryError);
      assert.equal(error.code, 'INVALID_WORKSPACE');
      return true;
    },
  );

  await assert.rejects(
    repository.setRecursiveScan('workspace-inexistente', true),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceRepositoryError);

      assert.equal(error.code, 'WORKSPACE_NOT_FOUND');

      return true;
    },
  );

  await repository.remove(workspaceWithRecursiveScan.id);

  const storedWorkspace = await repository.find(workspace.id);

  assert.deepEqual(storedWorkspace, renamedWorkspace);

  const workspaces = await repository.list();

  assert.equal(workspaces.length, 1);
  assert.deepEqual(workspaces[0], renamedWorkspace);

  await assert.rejects(
    repository.create({
      name: 'Duplicado',
      path: workspacePath,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceRepositoryError);

      assert.equal(error.code, 'WORKSPACE_ALREADY_EXISTS');

      return true;
    },
  );

  await repository.remove(workspace.id);

  assert.deepEqual(await repository.list(), []);

  assert.equal(await repository.find(workspace.id), null);

  await assert.rejects(repository.remove(workspace.id), (error: unknown) => {
    assert.ok(error instanceof WorkspaceRepositoryError);

    assert.equal(error.code, 'WORKSPACE_NOT_FOUND');

    return true;
  });
} finally {
  await rm(fixtureRoot, {
    recursive: true,
    force: true,
  });
}

const legacyFixtureRoot = await mkdtemp(
  path.join(tmpdir(), 'dev-dashboard-core-legacy-'),
);

try {
  const legacyConfigDirectory = path.join(legacyFixtureRoot, 'config');

  await mkdir(legacyConfigDirectory, {
    recursive: true,
  });

  await writeFile(
    path.join(legacyConfigDirectory, 'config.json'),
    JSON.stringify({
      version: 1,
      workspaces: [
        {
          id: 'legado',
          name: 'Legado',
          path: legacyFixtureRoot,
          enabled: true,
        },
      ],
    }),
    'utf8',
  );

  const legacyRepository = new WorkspaceRepository(legacyConfigDirectory);

  const legacyWorkspaces = await legacyRepository.list();

  assert.equal(legacyWorkspaces.length, 1);
  assert.equal(legacyWorkspaces[0]?.recursiveScan, false);

  assert.equal((await legacyRepository.find('legado'))?.recursiveScan, false);
} finally {
  await rm(legacyFixtureRoot, {
    recursive: true,
    force: true,
  });
}

// Regressão: config.json corrompido/com versão não suportada não deve mais
// derrubar o repositório inteiro (comportamento antigo: lançava e propagava
// o erro para quem chamasse list()/etc.) — agora degrada para uma lista
// vazia, como os demais repositórios, e guarda uma cópia do arquivo original
// ao lado antes de recriá-lo, para nunca perder a configuração do usuário
// silenciosamente.
{
  const corruptedFixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-core-corrupted-'),
  );
  const corruptedConfigDirectory = path.join(corruptedFixtureRoot, 'config');

  try {
    await mkdir(corruptedConfigDirectory, { recursive: true });
    await writeFile(
      path.join(corruptedConfigDirectory, 'config.json'),
      'isso não é json válido',
      'utf8',
    );

    const corruptedRepository = new WorkspaceRepository(
      corruptedConfigDirectory,
    );

    assert.deepEqual(await corruptedRepository.list(), []);

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(corruptedConfigDirectory);
    assert.ok(
      entries.some((entry) => entry.includes('.unreadable-')),
      'uma cópia de segurança do config.json corrompido deve ser criada ao lado',
    );

    // O repositório continua utilizável normalmente após a quarentena.
    const workspace = await corruptedRepository.create({
      name: 'Novo Workspace',
      path: corruptedFixtureRoot,
    });
    assert.equal(workspace.name, 'Novo Workspace');
  } finally {
    await rm(corruptedFixtureRoot, { recursive: true, force: true });
  }
}

// version não suportada (ex. um schema futuro) tem o mesmo tratamento:
// quarentena + degrada para lista vazia, sem lançar.
{
  const futureVersionFixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-core-future-version-'),
  );
  const futureVersionConfigDirectory = path.join(
    futureVersionFixtureRoot,
    'config',
  );

  try {
    await mkdir(futureVersionConfigDirectory, { recursive: true });
    await writeFile(
      path.join(futureVersionConfigDirectory, 'config.json'),
      JSON.stringify({ version: 2, workspaces: [] }),
      'utf8',
    );

    const futureVersionRepository = new WorkspaceRepository(
      futureVersionConfigDirectory,
    );

    assert.deepEqual(await futureVersionRepository.list(), []);

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(futureVersionConfigDirectory);
    assert.ok(entries.some((entry) => entry.includes('.unreadable-')));
  } finally {
    await rm(futureVersionFixtureRoot, { recursive: true, force: true });
  }
}

// Arquivo ausente (primeira execução) continua o caso normal — sem
// quarentena, sem aviso.
{
  const missingFixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-core-missing-'),
  );
  const missingConfigDirectory = path.join(missingFixtureRoot, 'config');

  try {
    const missingRepository = new WorkspaceRepository(missingConfigDirectory);
    assert.deepEqual(await missingRepository.list(), []);

    const { existsSync } = await import('node:fs');
    assert.equal(
      existsSync(missingConfigDirectory),
      false,
      'nenhum diretório/arquivo deve ser criado só por listar um workspace inexistente',
    );
  } finally {
    await rm(missingFixtureRoot, { recursive: true, force: true });
  }
}

// Chamadas concorrentes de create()/remove() na mesma instância não podem
// perder atualizações: sem serialização, um read-modify-write intercalado
// faria uma escrita sobrescrever a outra.
{
  const concurrencyFixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-core-concurrency-'),
  );
  const concurrencyConfigDirectory = path.join(
    concurrencyFixtureRoot,
    'config',
  );
  const concurrencyProjectsRoot = path.join(concurrencyFixtureRoot, 'projects');

  try {
    const workspacePaths = await Promise.all(
      Array.from({ length: 8 }, async (_value, index) => {
        const projectPath = path.join(concurrencyProjectsRoot, `p${index}`);
        await mkdir(projectPath, { recursive: true });
        return projectPath;
      }),
    );

    const concurrencyRepository = new WorkspaceRepository(
      concurrencyConfigDirectory,
    );

    await Promise.all(
      workspacePaths.map((workspaceDirectory, index) =>
        concurrencyRepository.create({
          name: `Concorrente ${index}`,
          path: workspaceDirectory,
        }),
      ),
    );

    const stored = await concurrencyRepository.list();
    assert.equal(
      stored.length,
      workspacePaths.length,
      'todas as criações concorrentes devem ser persistidas, sem lost update',
    );

    await Promise.all(
      stored.map((workspace) => concurrencyRepository.remove(workspace.id)),
    );

    assert.deepEqual(await concurrencyRepository.list(), []);
  } finally {
    await rm(concurrencyFixtureRoot, { recursive: true, force: true });
  }
}
