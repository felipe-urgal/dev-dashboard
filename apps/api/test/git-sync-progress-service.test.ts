import assert from 'node:assert/strict';
import test from 'node:test';

import { GitSyncProgressService } from '../src/services/git-sync-progress-service.js';

test('publica progresso apenas para assinantes do projeto correto', () => {
  const service = new GitSyncProgressService();
  const received: string[] = [];
  const ignored: string[] = [];

  const unsubscribe = service.subscribe('project-a', (event) => {
    received.push(`${event.operation}:${event.stepId}:${event.status}`);
  });
  service.subscribe('project-b', (event) => {
    ignored.push(event.stepId);
  });

  const progress = service.createReporter('project-a', 'main');
  progress.report({
    stepId: 'fetch-origin',
    status: 'running',
    command: 'git fetch --prune origin',
    message: 'Buscando origin.',
  });
  progress.report({
    stepId: 'fetch-origin',
    status: 'success',
    command: 'git fetch --prune origin',
    message: 'origin atualizado.',
  });
  unsubscribe();
  progress.report({
    stepId: 'checkout-main',
    status: 'running',
    command: 'git checkout main',
    message: 'Selecionando main.',
  });

  assert.deepEqual(received, [
    'main:fetch-origin:running',
    'main:fetch-origin:success',
  ]);
  assert.deepEqual(ignored, []);
});
