import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectFileMutationError,
  ProjectFileMutationService,
} from '../src/services/project-file-mutation-service.js';

async function fixture(context: test.TestContext) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-file-mutations-'),
  );
  const outside = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-file-mutations-outside-'),
  );
  context.after(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  await mkdir(path.join(root, 'src', 'nested'), { recursive: true });
  await writeFile(
    path.join(root, 'src', 'main.ts'),
    'export const value = 1;\n',
  );
  await writeFile(path.join(root, 'src', 'nested', 'item.txt'), 'item\n');
  await symlink(outside, path.join(root, 'outside-link'));
  return { root };
}

function assertMutationError(
  error: unknown,
  code: ProjectFileMutationError['code'],
): boolean {
  assert.ok(error instanceof ProjectFileMutationError);
  assert.equal(error.code, code);
  return true;
}

test('cria arquivo e diretório sem sobrescrever ou escapar por symlink', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileMutationService();

  const directory = await service.createEntry(root, {
    path: 'src/generated',
    kind: 'directory',
  });
  assert.deepEqual(directory, {
    operation: 'create',
    path: 'src/generated',
    kind: 'directory',
  });

  const file = await service.createEntry(root, {
    path: 'src/generated/model.ts',
    kind: 'file',
    content: 'export {};\n',
  });
  assert.equal(file.path, 'src/generated/model.ts');
  assert.equal(
    await readFile(path.join(root, 'src', 'generated', 'model.ts'), 'utf8'),
    'export {};\n',
  );

  await assert.rejects(
    service.createEntry(root, {
      path: 'src/generated/model.ts',
      kind: 'file',
    }),
    (error) => assertMutationError(error, 'FILE_ALREADY_EXISTS'),
  );
  await assert.rejects(
    service.createEntry(root, { path: '../escape', kind: 'directory' }),
    (error) => assertMutationError(error, 'FILE_PATH_INVALID'),
  );
  await assert.rejects(
    service.createEntry(root, { path: 'outside-link/file.txt', kind: 'file' }),
    (error) => assertMutationError(error, 'FILE_OUTSIDE_PROJECT'),
  );
});

test('renomeia após preview e recusa token reutilizado ou mudança externa', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileMutationService();

  const preview = await service.previewMutation(root, {
    operation: 'rename',
    path: 'src/main.ts',
    destinationPath: 'src/app.ts',
  });
  assert.equal(preview.requiresPhrase, false);
  assert.equal(preview.affectedFiles, 1);

  const renamed = await service.applyMutation(root, {
    confirmationToken: preview.confirmationToken,
  });
  assert.equal(renamed.destinationPath, 'src/app.ts');
  assert.equal(
    await readFile(path.join(root, 'src', 'app.ts'), 'utf8'),
    'export const value = 1;\n',
  );

  await assert.rejects(
    service.applyMutation(root, {
      confirmationToken: preview.confirmationToken,
    }),
    (error) => assertMutationError(error, 'FILE_MUTATION_CONFIRMATION_INVALID'),
  );

  const changedPreview = await service.previewMutation(root, {
    operation: 'rename',
    path: 'src/app.ts',
    destinationPath: 'src/index.ts',
  });
  await writeFile(
    path.join(root, 'src', 'app.ts'),
    'export const changed = true;\n',
  );
  await assert.rejects(
    service.applyMutation(root, {
      confirmationToken: changedPreview.confirmationToken,
    }),
    (error) => assertMutationError(error, 'FILE_CHANGED_EXTERNALLY'),
  );
});

test('exclusão recursiva exige o caminho exato e remove todo o impacto', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileMutationService();

  const preview = await service.previewMutation(root, {
    operation: 'delete',
    path: 'src/nested',
  });
  assert.equal(preview.requiresPhrase, true);
  assert.equal(preview.confirmationPhrase, 'src/nested');
  assert.equal(preview.affectedFiles, 1);

  await assert.rejects(
    service.applyMutation(root, {
      confirmationToken: preview.confirmationToken,
      confirmationPhrase: 'nested',
    }),
    (error) => assertMutationError(error, 'FILE_MUTATION_CONFIRMATION_INVALID'),
  );

  const secondPreview = await service.previewMutation(root, {
    operation: 'delete',
    path: 'src/nested',
  });
  const result = await service.applyMutation(root, {
    confirmationToken: secondPreview.confirmationToken,
    confirmationPhrase: 'src/nested',
  });
  assert.equal(result.operation, 'delete');
  await assert.rejects(access(path.join(root, 'src', 'nested')));
});

test('bloqueia mutação de diretório que contém arquivo protegido', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileMutationService();
  await mkdir(path.join(root, 'private'));
  await writeFile(
    path.join(root, 'private', '.env.production'),
    'TOKEN=secret\n',
  );

  await assert.rejects(
    service.previewMutation(root, {
      operation: 'delete',
      path: 'private',
    }),
    (error) => assertMutationError(error, 'FILE_MUTATION_HIDDEN_CONTENT'),
  );
});
