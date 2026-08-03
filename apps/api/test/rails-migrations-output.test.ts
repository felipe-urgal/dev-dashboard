import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultCommandRunner } from '../src/services/rails-inspection/command-resolution.js';
import { parseMigrationStatusBlocks } from '../src/services/rails-inspection/migrations-parsing.js';

const STATUS_OUTPUT = `
database: app_development

 Status   Migration ID    Migration Name
--------------------------------------------------
   up     20200101010101  Create users
  down    20200102020202  Add index to users
`;

test('preserva saída Rails emitida em stderr por wrappers Docker', async () => {
  const result = await defaultCommandRunner(
    process.execPath,
    ['-e', `process.stderr.write(${JSON.stringify(STATUS_OUTPUT)})`],
    { cwd: process.cwd() },
  );

  const [block] = parseMigrationStatusBlocks(result.stdout);
  assert.equal(block?.database, 'app_development');
  assert.deepEqual(block?.migrations, [
    { status: 'up', version: '20200101010101', name: 'Create users' },
    { status: 'down', version: '20200102020202', name: 'Add index to users' },
  ]);
});

test('ignora sequências ANSI ao interpretar o status', () => {
  const colored = STATUS_OUTPUT
    .replace('up     20200101010101', '\u001b[32mup\u001b[0m     20200101010101')
    .replace('down    20200102020202', '\u001b[31mdown\u001b[0m    20200102020202');

  const [block] = parseMigrationStatusBlocks(colored);
  assert.deepEqual(block?.migrations.map((item) => item.status), ['up', 'down']);
});

test('remove prefixo de serviço do Docker Compose', () => {
  const prefixed = STATUS_OUTPUT
    .split('\n')
    .map((line) => line ? `web | ${line}` : line)
    .join('\n');

  const [block] = parseMigrationStatusBlocks(prefixed);
  assert.equal(block?.database, 'app_development');
  assert.deepEqual(block?.migrations.map((item) => item.version), [
    '20200101010101',
    '20200102020202',
  ]);
});
