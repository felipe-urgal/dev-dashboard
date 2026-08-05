import { readFile, writeFile, unlink } from 'node:fs/promises';

const editorPath = 'apps/web/src/components/ProjectEmbeddedEditor.vue';
let editor = await readFile(editorPath, 'utf8');
const editorStart = editor.indexOf('function routeEditorTarget()');
const editorEnd = editor.indexOf('\nasync function openRouteEditorTarget()', editorStart);
if (editorStart < 0 || editorEnd < 0) {
  throw new Error('Bloco routeEditorTarget não encontrado.');
}
const routeEditorTarget = `function routeEditorTarget(): { path: string; line: number; column: number } | null {
  const rawPath = Array.isArray(route.query.file) ? route.query.file[0] : route.query.file;
  if (typeof rawPath !== 'string') return null;
  const normalizedPath = rawPath.split(String.fromCharCode(92)).join('/');
  const filePath = normalizedPath.startsWith('./')
    ? normalizedPath.slice(2)
    : normalizedPath;
  const firstCharacter = filePath.charCodeAt(0);
  const windowsAbsolute = filePath.length >= 3
    && ((firstCharacter >= 65 && firstCharacter <= 90)
      || (firstCharacter >= 97 && firstCharacter <= 122))
    && filePath[1] === ':'
    && filePath[2] === '/';
  if (!filePath || filePath.startsWith('/') || windowsAbsolute) return null;
  if (filePath.split('/').some((segment) => segment === '..' || segment === '')) return null;
  const rawLine = Array.isArray(route.query.line) ? route.query.line[0] : route.query.line;
  const rawColumn = Array.isArray(route.query.column) ? route.query.column[0] : route.query.column;
  const line = Math.max(1, Number.parseInt(String(rawLine ?? '1'), 10) || 1);
  const column = Math.max(1, Number.parseInt(String(rawColumn ?? '1'), 10) || 1);
  return { path: filePath, line, column };
}
`;
editor = editor.slice(0, editorStart) + routeEditorTarget + editor.slice(editorEnd);
await writeFile(editorPath, editor, 'utf8');

const parserPath = 'apps/web/src/composables/project-test-failures.ts';
let parser = await readFile(parserPath, 'utf8');
const oldMinitestCleanup = ".replace(/\\s*\\[[^\\]]+\\]\\s*$/, '')";
const newMinitestCleanup = ".replace(/\\s*\\[[^\\]]+\\]:?\\s*$/, '')";
if (!parser.includes(oldMinitestCleanup)) {
  throw new Error('Limpeza de nome do Minitest não encontrada.');
}
parser = parser.replace(oldMinitestCleanup, newMinitestCleanup);
await writeFile(parserPath, parser, 'utf8');

const taskPath = 'docs/tasks/100-test-failure-navigator.md';
let task = await readFile(taskPath, 'utf8');
task = task.replace(
  'Em implementação na branch `agent/task-100-test-failure-navigator`.',
  'Implementada no PR #191, aguardando validação e merge.',
);
await writeFile(taskPath, task, 'utf8');

await unlink('scripts/task-100-ci-fix.mjs');
await unlink('.github/workflows/task-100-ci-fix.yml');
