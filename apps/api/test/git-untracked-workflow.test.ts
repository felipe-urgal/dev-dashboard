import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { GitService } from '../src/services/git-service.js';
import { ProjectFileMutationService } from '../src/services/project-file-mutation-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args as string[], {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout;
}

test('arquivos novos e pastas vazias aparecem no diff e entram no commit', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-untracked-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(root, 'README.md'), 'inicial\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'init']);

  await mkdir(path.join(root, 'docs'));
  const fileMutations = new ProjectFileMutationService();
  await fileMutations.createEntry(root, {
    path: 'docs/generated',
    kind: 'directory',
  });
  await writeFile(
    path.join(root, 'novo.ts'),
    'export const first = 1;\nexport const second = 2;\n',
  );

  assert.equal(
    await readFile(path.join(root, 'docs', 'generated', '.gitkeep'), 'utf8'),
    '',
  );

  const service = new GitService();
  const snapshot = await service.getDiffSnapshot(root, 'combined');
  const byPath = new Map(snapshot.files.map((file) => [file.path, file]));
  const newFile = byPath.get('novo.ts');
  const directoryMarker = byPath.get('docs/generated/.gitkeep');

  assert.ok(newFile, 'arquivo não rastreado deve aparecer no diff');
  assert.equal(newFile!.status, 'untracked');
  assert.equal(newFile!.additions, 2);
  assert.equal(newFile!.deletions, 0);
  assert.ok(directoryMarker, 'pasta vazia deve aparecer pelo .gitkeep');
  assert.equal(directoryMarker!.status, 'untracked');

  const fileDiff = await service.getFileDiff(root, 'novo.ts', 'combined');
  assert.equal(fileDiff.status, 'untracked');
  assert.match(fileDiff.content, /new file mode/);
  assert.match(fileDiff.content, /\+export const first = 1;/);

  const confirmation = service.prepareMutationConfirmation(
    'p1',
    'commit',
    'main',
  );
  await service.commit(
    root,
    'p1',
    'inclui novos arquivos',
    true,
    confirmation.token,
  );

  const tree = await git(root, ['ls-tree', '-r', '--name-only', 'HEAD']);
  assert.match(tree, /^docs\/generated\/\.gitkeep$/m);
  assert.match(tree, /^novo\.ts$/m);
  assert.equal((await git(root, ['status', '--porcelain'])).trim(), '');
});
