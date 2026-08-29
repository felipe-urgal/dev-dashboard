import { readFile, writeFile } from 'node:fs/promises';

const path = 'apps/web/src/views/DatabaseView.vue';
let source = await readFile(path, 'utf8');
const before =
  'A conexão expirou por inatividade. Conecte-se novamente para continuar.';
const after = 'A conexão expirou. Conecte-se novamente para continuar.';
if (!source.includes(before)) throw new Error('Copy de expiração não encontrada.');
source = source.replace(before, after);
await writeFile(path, source);
