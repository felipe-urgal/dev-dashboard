import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { runGit } from '../src/services/git-service/run.js';

const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-run-'));
const fakeGit = path.join(root, 'git');
const originalPath = process.env.PATH;

await writeFile(
  fakeGit,
  `#!/usr/bin/env node
if (process.argv[2] === 'hang') {
  setInterval(() => {}, 1_000);
} else {
  process.stdout.write(JSON.stringify({
    terminalPrompt: process.env.GIT_TERMINAL_PROMPT,
    credentialInteractive: process.env.GCM_INTERACTIVE,
    optionalLocks: process.env.GIT_OPTIONAL_LOCKS,
    locale: process.env.LC_ALL,
  }));
}
`,
  'utf8',
);
await chmod(fakeGit, 0o755);
process.env.PATH = `${root}${path.delimiter}${originalPath ?? ''}`;

after(async () => {
  process.env.PATH = originalPath;
  await rm(root, { recursive: true, force: true });
});

test('executa Git sem abrir prompt interativo invisível', async () => {
  const output = await runGit(root, ['status'], { timeoutMs: 1_000 });
  const environment = JSON.parse(output) as Record<string, string>;

  assert.equal(environment.terminalPrompt, '0');
  assert.equal(environment.credentialInteractive, 'Never');
  assert.equal(environment.optionalLocks, '0');
  assert.equal(environment.locale, 'C');
});

test('encerra um comando Git que ultrapassa o limite', async () => {
  const startedAt = Date.now();

  await assert.rejects(
    runGit(root, ['hang'], { timeoutMs: 50 }),
  );

  assert.ok(Date.now() - startedAt < 2_000);
});
