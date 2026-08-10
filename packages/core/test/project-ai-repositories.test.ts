import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectAiConsentRepository,
  ProjectAiConsentRepositoryError,
} from '../src/project-ai-consent-repository.js';
import { ProjectAiSelectionRepository } from '../src/project-ai-selection-repository.js';

async function tempDirectory(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

test('persiste consentimento cloud em arquivo privado e permite revogação', async () => {
  const directory = await tempDirectory('project-ai-consent-');
  const repository = new ProjectAiConsentRepository(directory);

  assert.equal(repository.has('project-a', 'openai'), false);
  assert.equal(repository.has('', 'openai'), false);

  await repository.set('project-b', 'openai', true);
  await repository.set('project-a', 'openai', true);

  assert.deepEqual(JSON.parse(await readFile(repository.filePath, 'utf8')), {
    version: 1,
    grants: [
      { projectId: 'project-a', provider: 'openai' },
      { projectId: 'project-b', provider: 'openai' },
    ],
  });
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.filePath)).mode & 0o777, 0o600);
  assert.equal(
    new ProjectAiConsentRepository(directory).has('project-a', 'openai'),
    true,
  );

  await repository.set('project-a', 'openai', false);
  assert.equal(repository.has('project-a', 'openai'), false);
  assert.equal(repository.has('project-b', 'openai'), true);
});

test('recusa consentimento com projeto ou provider inválido', async () => {
  const repository = new ProjectAiConsentRepository(
    await tempDirectory('project-ai-consent-invalid-'),
  );

  await assert.rejects(
    repository.set('', 'openai', true),
    (error) =>
      error instanceof ProjectAiConsentRepositoryError &&
      error.code === 'INVALID_PROJECT_ID',
  );
  await assert.rejects(
    repository.set('project-a', 'unsupported' as 'openai', true),
    (error) =>
      error instanceof ProjectAiConsentRepositoryError &&
      error.code === 'INVALID_PROVIDER',
  );
});

test('seleção de IA usa default, persiste ordenada e permite recarregar', async () => {
  const directory = await tempDirectory('project-ai-selection-');
  const file = path.join(directory, 'project-ai-selection.json');
  const repository = new ProjectAiSelectionRepository(directory);

  assert.deepEqual(repository.get('project-a'), {
    provider: 'ollama',
    mode: 'fast',
  });

  await repository.set('project-b', { provider: 'ollama', mode: 'complete' });
  await repository.set('project-a', { provider: 'openai', mode: 'fast' });

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
    version: 1,
    projects: {
      'project-a': { provider: 'openai', mode: 'fast' },
      'project-b': { provider: 'ollama', mode: 'complete' },
    },
  });
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(file)).mode & 0o777, 0o600);

  const reloaded = new ProjectAiSelectionRepository(directory);
  const selection = reloaded.get('project-a');
  assert.deepEqual(selection, { provider: 'openai', mode: 'fast' });
  selection.provider = 'ollama';
  assert.deepEqual(reloaded.get('project-a'), {
    provider: 'openai',
    mode: 'fast',
  });
});

test('recusa seleção de IA inválida', async () => {
  const repository = new ProjectAiSelectionRepository(
    await tempDirectory('project-ai-selection-invalid-'),
  );

  await assert.rejects(
    repository.set('', { provider: 'ollama', mode: 'fast' }),
    /identificador do projeto é inválido/i,
  );
  await assert.rejects(
    repository.set('project-a', {
      provider: 'unsupported' as 'ollama',
      mode: 'fast',
    }),
    /seleção de execução de IA é inválida/i,
  );
  await assert.rejects(
    repository.set('project-a', {
      provider: 'ollama',
      mode: 'unsupported' as 'fast',
    }),
    /seleção de execução de IA é inválida/i,
  );
});

test('arquivos de IA corrompidos são ignorados e o estado volta ao default seguro', async () => {
  const directory = await tempDirectory('project-ai-corrupt-');
  const consentFile = path.join(directory, 'project-ai-consent.json');
  const selectionFile = path.join(directory, 'project-ai-selection.json');

  await writeFile(consentFile, '{conteudo-invalido', 'utf8');
  const consent = new ProjectAiConsentRepository(directory);
  assert.equal(consent.has('project-a', 'openai'), false);

  await writeFile(
    selectionFile,
    JSON.stringify({ version: 2, projects: {} }),
    'utf8',
  );
  const selection = new ProjectAiSelectionRepository(directory);
  assert.deepEqual(selection.get('project-a'), {
    provider: 'ollama',
    mode: 'fast',
  });
});
