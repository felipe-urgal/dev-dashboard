import { readFile, writeFile, unlink } from 'node:fs/promises';

const target = 'apps/web/src/composables/useProjectTestsPanel.ts';
let content = await readFile(target, 'utf8');

const duplicatedDestructure = `    currentCommandText,
    currentRunner,
    currentStatusTone,`;
const fixedDestructure = `    currentCommandText,
    currentStatusTone,`;
if (!content.includes(duplicatedDestructure)) {
  throw new Error('Desestruturação duplicada de currentRunner não encontrada.');
}
content = content.replace(duplicatedDestructure, fixedDestructure);

const returnAnchor = `    currentCommandText,
    currentStatusTone,`;
const fixedReturn = `    currentCommandText,
    currentRunner,
    currentStatusTone,`;
const returnStart = content.indexOf('  return {');
const returnIndex = content.indexOf(returnAnchor, returnStart);
if (returnIndex < 0) {
  throw new Error('Objeto de retorno não encontrado.');
}
content = content.slice(0, returnIndex)
  + content.slice(returnIndex).replace(returnAnchor, fixedReturn);

await writeFile(target, content, 'utf8');
await unlink('scripts/task-100-runner-fix.mjs');
await unlink('.github/workflows/task-100-runner-fix.yml');
