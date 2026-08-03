import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectFileError,
  ProjectFileService,
} from '../src/services/project-file-service.js';
import {
  ProjectWorkspaceEditError,
  ProjectWorkspaceEditService,
} from '../src/services/project-workspace-edit-service.js';

async function fixture(context: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-workspace-edit-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'src'));
  await writeFile(
    path.join(root, 'src', 'one.ts'),
    'const one = 1;\n',
  );
  await writeFile(
    path.join(root, 'src', 'two.ts'),
    'const two = 2;\n',
  );
  return { root };
}

function assertWorkspaceError(
  error: unknown,
  code: ProjectWorkspaceEditError['code'],
): boolean {
  assert.ok(error instanceof ProjectWorkspaceEditError);
  assert.equal(error.code, code);
  return true;
}

test('monitora somente arquivos abertos e devolve conteúdo quando muda', async (context) => {
  const { root } = await fixture(context);
  const fileService = new ProjectFileService();
  const service = new ProjectWorkspaceEditService(fileService, () => 1_000);
  const one = await fileService.readFile(root, 'src/one.ts');
  const two = await fileService.readFile(root, 'src/two.ts');

  const unchanged = await service.watchOpenFiles(root, [
    { path: one.path, version: one.version },
    { path: two.path, version: two.version },
  ]);
  assert.equal(unchanged.checkedAt, '1970-01-01T00:00:01.000Z');
  assert.deepEqual(unchanged.items.map((item) => item.state), [
    'unchanged',
    'unchanged',
  ]);

  await writeFile(path.join(root, 'src', 'one.ts'), 'const one = 10;\n');
  await unlink(path.join(root, 'src', 'two.ts'));
  const changed = await service.watchOpenFiles(root, [
    { path: one.path, version: one.version },
    { path: two.path, version: two.version },
  ]);
  assert.equal(changed.items[0]?.state, 'changed');
  assert.equal(changed.items[0]?.file?.content, 'const one = 10;\n');
  assert.equal(changed.items[1]?.state, 'deleted');
});

test('mostra preview e aplica edições em múltiplos arquivos', async (context) => {
  const { root } = await fixture(context);
  const fileService = new ProjectFileService();
  const service = new ProjectWorkspaceEditService(fileService);
  const one = await fileService.readFile(root, 'src/one.ts');
  const two = await fileService.readFile(root, 'src/two.ts');

  const preview = await service.previewWorkspaceEdit(root, 'project-1', {
    files: [
      {
        path: one.path,
        expectedVersion: one.version,
        edits: [{
          range: {
            start: { line: 1, column: 13 },
            end: { line: 1, column: 14 },
          },
          newText: '10',
        }],
      },
      {
        path: two.path,
        expectedVersion: two.version,
        edits: [{
          range: {
            start: { line: 1, column: 13 },
            end: { line: 1, column: 14 },
          },
          newText: '20',
        }],
      },
    ],
  });
  assert.equal(preview.files[0]?.afterContent, 'const one = 10;\n');
  assert.equal(preview.files[1]?.afterContent, 'const two = 20;\n');

  const result = await service.applyWorkspaceEdit(
    root,
    'project-1',
    preview.confirmationToken,
  );
  assert.equal(result.files.length, 2);
  assert.equal(
    await readFile(path.join(root, 'src', 'one.ts'), 'utf8'),
    'const one = 10;\n',
  );
  assert.equal(
    await readFile(path.join(root, 'src', 'two.ts'), 'utf8'),
    'const two = 20;\n',
  );

  await assert.rejects(
    service.applyWorkspaceEdit(root, 'project-1', preview.confirmationToken),
    (error) => assertWorkspaceError(
      error,
      'WORKSPACE_EDIT_CONFIRMATION_REQUIRED',
    ),
  );
});

test('recusa faixas sobrepostas e mudança externa depois do preview', async (context) => {
  const { root } = await fixture(context);
  const fileService = new ProjectFileService();
  const service = new ProjectWorkspaceEditService(fileService);
  const one = await fileService.readFile(root, 'src/one.ts');

  await assert.rejects(
    service.previewWorkspaceEdit(root, 'project-1', {
      files: [{
        path: one.path,
        expectedVersion: one.version,
        edits: [
          {
            range: {
              start: { line: 1, column: 7 },
              end: { line: 1, column: 10 },
            },
            newText: 'first',
          },
          {
            range: {
              start: { line: 1, column: 9 },
              end: { line: 1, column: 12 },
            },
            newText: 'second',
          },
        ],
      }],
    }),
    (error) => assertWorkspaceError(error, 'WORKSPACE_EDIT_INVALID'),
  );

  const preview = await service.previewWorkspaceEdit(root, 'project-1', {
    files: [{
      path: one.path,
      expectedVersion: one.version,
      edits: [{
        range: {
          start: { line: 1, column: 13 },
          end: { line: 1, column: 14 },
        },
        newText: '10',
      }],
    }],
  });
  await writeFile(path.join(root, 'src', 'one.ts'), 'const external = true;\n');

  await assert.rejects(
    service.applyWorkspaceEdit(root, 'project-1', preview.confirmationToken),
    (error) => assertWorkspaceError(
      error,
      'WORKSPACE_EDIT_CHANGED_EXTERNALLY',
    ),
  );
});

class FailingSecondWriteService extends ProjectFileService {
  private writes = 0;

  public override async writeFile(
    projectPath: string,
    relativePath: string,
    content: string,
    expectedVersion: string,
  ) {
    this.writes += 1;
    if (this.writes === 2) {
      throw new ProjectFileError('FILE_WRITE_FAILED', 'Falha simulada.');
    }
    return super.writeFile(
      projectPath,
      relativePath,
      content,
      expectedVersion,
    );
  }
}

test('restaura arquivos já aplicados quando uma escrita posterior falha', async (context) => {
  const { root } = await fixture(context);
  const fileService = new FailingSecondWriteService();
  const service = new ProjectWorkspaceEditService(fileService);
  const one = await fileService.readFile(root, 'src/one.ts');
  const two = await fileService.readFile(root, 'src/two.ts');

  const preview = await service.previewWorkspaceEdit(root, 'project-1', {
    files: [
      {
        path: one.path,
        expectedVersion: one.version,
        edits: [{
          range: {
            start: { line: 1, column: 13 },
            end: { line: 1, column: 14 },
          },
          newText: '10',
        }],
      },
      {
        path: two.path,
        expectedVersion: two.version,
        edits: [{
          range: {
            start: { line: 1, column: 13 },
            end: { line: 1, column: 14 },
          },
          newText: '20',
        }],
      },
    ],
  });

  await assert.rejects(
    service.applyWorkspaceEdit(root, 'project-1', preview.confirmationToken),
    (error) => {
      assert.ok(error instanceof ProjectFileError);
      assert.equal(error.code, 'FILE_WRITE_FAILED');
      return true;
    },
  );
  assert.equal(
    await readFile(path.join(root, 'src', 'one.ts'), 'utf8'),
    'const one = 1;\n',
  );
  assert.equal(
    await readFile(path.join(root, 'src', 'two.ts'), 'utf8'),
    'const two = 2;\n',
  );
});
