import { readFile, writeFile } from 'node:fs/promises';

const path = 'apps/web/src/views/DatabaseView.vue';
let source = await readFile(path, 'utf8');

const replacements = [
  [
    `          <button\n            type="button"\n            class="database-primary-button database-connection-button"\n            @click="openExplorerConnection"`,
    `          <button\n            type="button"\n            class="database-primary-button database-connection-button"\n            :disabled="explorerLoading"\n            @click="openExplorerConnection"`,
  ],
  [
    `          <button\n            v-if="explorerConnection"\n            type="button"\n            class="database-connection-disconnect"\n            @click="disconnectExplorer"`,
    `          <button\n            v-if="explorerConnection"\n            type="button"\n            class="database-connection-disconnect"\n            :disabled="explorerLoading"\n            @click="disconnectExplorer"`,
  ],
  [
    `              <select\n                :value="explorerDatabase"\n                @change="onExplorerDatabaseChange"`,
    `              <select\n                :value="explorerDatabase"\n                :disabled="explorerLoading"\n                @change="onExplorerDatabaseChange"`,
  ],
  [
    `                type="button"\n                :class="{ active: explorerTable === table.name }"\n                @click="`,
    `                type="button"\n                :class="{ active: explorerTable === table.name }"\n                :disabled="explorerLoading"\n                @click="`,
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) {
    throw new Error(`Trecho esperado não encontrado: ${before.slice(0, 80)}`);
  }
  source = source.replace(before, after);
}

await writeFile(path, source);
