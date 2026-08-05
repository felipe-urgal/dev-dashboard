import { readFile, writeFile, unlink } from 'node:fs/promises';

const target = 'apps/web/src/composables/project-test-failures.ts';
let content = await readFile(target, 'utf8');
const previous = "const failureStart = /^\\s*\\d+\\)\\s+Failure:\\s*$/;";
const replacement = "const failureStart = /^\\s*(?:\\d+\\)\\s+)?Failure:\\s*$/;";
if (!content.includes(previous)) {
  throw new Error('Marcador Minitest esperado não encontrado.');
}
content = content.replace(previous, replacement);
await writeFile(target, content, 'utf8');

await unlink('scripts/task-100-minitest-heading-fix.mjs');
await unlink('.github/workflows/task-100-minitest-heading-fix.yml');
