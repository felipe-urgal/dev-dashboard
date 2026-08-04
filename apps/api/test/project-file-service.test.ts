import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectFileError,
  ProjectFileService,
} from '../src/services/project-file-service.js';

async function fixture(context: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-files-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-outside-'));
  context.after(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, '.git'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(path.join(root, 'src', 'main.ts'), 'const answer = 42;\n');
  await writeFile(path.join(root, 'README.md'), '# Projeto\nResposta: answer\n');
  await writeFile(path.join(root, '.env.local'), 'SECRET=hidden\n');
  await writeFile(path.join(root, '.git', 'config'), 'private\n');
  await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'ignored\n');
  await writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
  await writeFile(path.join(root, 'large.txt'), Buffer.alloc(512 * 1024 + 1, 97));
  await writeFile(path.join(outside, 'secret.txt'), 'outside\n');
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'outside-link'));

  return { root };
}

function assertProjectFileError(
  error: unknown,
  code: ProjectFileError['code'],
): boolean {
  assert.ok(error instanceof ProjectFileError);
  assert.equal(error.code, code);
  return true;
}

test('lista somente arquivos permitidos e ordena diretórios primeiro', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();

  const listing = await service.listDirectory(root);
  assert.deepEqual(
    listing.entries.map((entry) => [entry.kind, entry.path]),
    [
      ['directory', 'src'],
      ['file', 'binary.bin'],
      ['file', 'large.txt'],
      ['file', 'README.md'],
    ],
  );
  assert.equal(listing.truncated, false);
});

test('lê texto com versão estável e linguagem detectada', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();

  const file = await service.readFile(root, 'src/main.ts');
  assert.equal(file.language, 'typescript');
  assert.equal(file.content, 'const answer = 42;\n');
  assert.equal(file.writable, true);
  assert.match(file.version, /^[a-f0-9]{64}$/);
});

test('reconhece a linguagem de arquivos .haml pela extensão final', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();
  await writeFile(path.join(root, 'view.html.haml'), '%div.card\n  = title\n');

  const file = await service.readFile(root, 'view.html.haml');
  assert.equal(file.language, 'haml');
});

test('salva atomicamente, renova a versão e preserva permissões', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();
  const target = path.join(root, 'src', 'main.ts');
  await chmod(target, 0o640);
  const opened = await service.readFile(root, 'src/main.ts');

  const saved = await service.writeFile(
    root,
    'src/main.ts',
    'const answer = 43;\n',
    opened.version,
  );

  assert.equal(saved.content, 'const answer = 43;\n');
  assert.notEqual(saved.version, opened.version);
  assert.equal(await readFile(target, 'utf8'), saved.content);
  assert.equal((await stat(target)).mode & 0o777, 0o640);
  assert.equal(
    (await readdir(path.dirname(target))).some((name) => name.includes('.dev-dashboard-')),
    false,
  );
});

test('não sobrescreve uma alteração externa e remove o temporário', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();
  const target = path.join(root, 'src', 'main.ts');
  const opened = await service.readFile(root, 'src/main.ts');
  await writeFile(target, 'const answer = 99;\n');

  await assert.rejects(
    service.writeFile(
      root,
      'src/main.ts',
      'const answer = 43;\n',
      opened.version,
    ),
    (error) => assertProjectFileError(error, 'FILE_CHANGED_EXTERNALLY'),
  );
  assert.equal(await readFile(target, 'utf8'), 'const answer = 99;\n');
  assert.equal(
    (await readdir(path.dirname(target))).some((name) => name.includes('.dev-dashboard-')),
    false,
  );
});

test('recusa traversal, symlink externo, arquivos sensíveis, binários e grandes', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();

  await assert.rejects(
    service.readFile(root, '../secret.txt'),
    (error) => assertProjectFileError(error, 'FILE_PATH_INVALID'),
  );
  await assert.rejects(
    service.readFile(root, 'outside-link'),
    (error) => assertProjectFileError(error, 'FILE_OUTSIDE_PROJECT'),
  );
  await assert.rejects(
    service.readFile(root, '.env.local'),
    (error) => assertProjectFileError(error, 'FILE_IGNORED'),
  );
  await assert.rejects(
    service.readFile(root, 'binary.bin'),
    (error) => assertProjectFileError(error, 'FILE_BINARY'),
  );
  await assert.rejects(
    service.readFile(root, 'large.txt'),
    (error) => assertProjectFileError(error, 'FILE_TOO_LARGE'),
  );
});

test('busca texto somente nos arquivos permitidos', async (context) => {
  const { root } = await fixture(context);
  const service = new ProjectFileService();

  const result = await service.search(root, 'answer');
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.items.map((item) => [item.path, item.line, item.column]),
    [
      ['README.md', 2, 11],
      ['src/main.ts', 1, 7],
    ],
  );
  assert.ok(result.scannedFiles >= 2);
});
