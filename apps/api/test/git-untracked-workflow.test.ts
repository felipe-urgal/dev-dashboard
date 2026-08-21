import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { GitService } from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args as string[], {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout;
}

test('arquivos novos dentro de pasta aparecem no diff e entram no commit', async (context) => {
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

  const iconsDirectory = path.join(root, 'social-medias-share', 'icons');
  await mkdir(iconsDirectory, { recursive: true });
  await writeFile(
    path.join(iconsDirectory, 'facebook.svg'),
    '<svg>facebook</svg>\n',
  );
  await writeFile(
    path.join(iconsDirectory, 'whatsapp.svg'),
    '<svg>whatsapp</svg>\n',
  );

  const service = new GitService();
  const snapshot = await service.getDiffSnapshot(root, 'combined');
  const byPath = new Map(snapshot.files.map((file) => [file.path, file]));
  const facebook = byPath.get('social-medias-share/icons/facebook.svg');
  const whatsapp = byPath.get('social-medias-share/icons/whatsapp.svg');

  assert.ok(facebook, 'arquivo novo dentro da pasta deve aparecer no diff');
  assert.equal(facebook!.status, 'untracked');
  assert.equal(facebook!.additions, 1);
  assert.equal(facebook!.deletions, 0);
  assert.ok(whatsapp, 'todos os arquivos novos da pasta devem aparecer no diff');
  assert.equal(whatsapp!.status, 'untracked');

  const fileDiff = await service.getFileDiff(
    root,
    'social-medias-share/icons/facebook.svg',
    'combined',
  );
  assert.equal(fileDiff.status, 'untracked');
  assert.match(fileDiff.content, /new file mode/);
  assert.match(fileDiff.content, /\+<svg>facebook<\/svg>/);

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
  assert.match(tree, /^social-medias-share\/icons\/facebook\.svg$/m);
  assert.match(tree, /^social-medias-share\/icons\/whatsapp\.svg$/m);
  assert.equal((await git(root, ['status', '--porcelain'])).trim(), '');
});
