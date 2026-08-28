import { readFile, writeFile } from 'node:fs/promises';

async function replaceInFile(path, replacements) {
  const original = await readFile(path, 'utf8');
  let next = original;

  for (const [from, to] of replacements) {
    if (!next.includes(from)) {
      throw new Error(`Trecho não encontrado em ${path}: ${from}`);
    }
    next = next.replaceAll(from, to);
  }

  await writeFile(path, next);
}

await replaceInFile('apps/api/src/routes/database.ts', [
  [
    "import {\n  DatabaseReadonlyError,\n  type DatabaseReadonlyService,\n} from '../services/database-readonly-service.js';",
    "import {\n  DatabaseExplorerError,\n  type DatabaseExplorerService,\n} from '../services/database-explorer-service.js';",
  ],
  ['databaseReadonlyService: DatabaseReadonlyService;', 'databaseExplorerService: DatabaseExplorerService;'],
  ["DatabaseReadonlyError['reason']", "DatabaseExplorerError['reason']"],
  ['error instanceof DatabaseReadonlyError', 'error instanceof DatabaseExplorerError'],
  ['options.databaseReadonlyService', 'options.databaseExplorerService'],
]);

await replaceInFile('apps/api/src/app.ts', [
  [
    'databaseReadonlyService: context.databaseReadonlyService,',
    'databaseExplorerService: context.databaseExplorerService,',
  ],
]);
