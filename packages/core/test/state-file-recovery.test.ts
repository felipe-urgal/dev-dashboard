import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from '../src/state-file-recovery.js';

// isFileNotFoundError
{
  try {
    readFileSync('/caminho/que/nao/existe/dev-dashboard.json', 'utf8');
    assert.fail('deveria ter lançado ENOENT');
  } catch (error) {
    assert.equal(isFileNotFoundError(error), true);
  }

  assert.equal(isFileNotFoundError(new Error('outro erro')), false);
  assert.equal(isFileNotFoundError('não é nem um Error'), false);
  assert.equal(isFileNotFoundError(null), false);
}

// quarantineUnreadableStateFile: arquivo ausente é um no-op silencioso
{
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-state-file-recovery-'),
  );
  try {
    const missingPath = path.join(fixtureRoot, 'nao-existe.json');
    quarantineUnreadableStateFile(missingPath);

    // Nada deve ter sido criado no diretório.
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(fixtureRoot);
    assert.deepEqual(entries, []);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

// quarantineUnreadableStateFile: copia o arquivo original ao lado, com o
// mesmo conteúdo, sem removê-lo.
{
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-state-file-recovery-'),
  );
  try {
    const targetPath = path.join(fixtureRoot, 'config.json');
    const originalContent = 'conteúdo original não interpretável';
    await writeFile(targetPath, originalContent, 'utf8');

    quarantineUnreadableStateFile(targetPath);

    assert.equal(
      existsSync(targetPath),
      true,
      'o arquivo original permanece no lugar',
    );

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(fixtureRoot);
    const quarantineEntry = entries.find(
      (entry) => entry !== 'config.json' && entry.includes('.unreadable-'),
    );
    assert.ok(quarantineEntry, 'uma cópia de quarentena deve ter sido criada');

    const quarantineContent = readFileSync(
      path.join(fixtureRoot, quarantineEntry!),
      'utf8',
    );
    assert.equal(quarantineContent, originalContent);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}
