import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProjectEditorId } from '@dev-dashboard/contracts';
import {
  ProjectEditorError,
  ProjectEditorService,
} from '../src/services/project-editor-service.js';

test('lista somente editores disponíveis e respeita DEV_EDITOR conhecido', async () => {
  const service = new ProjectEditorService({
    environment: { PATH: '/bin', DEV_EDITOR: 'cursor' },
    resolveExecutable: async (command) =>
      ['code', 'cursor'].includes(command) ? `/bin/${command}` : null,
  });

  assert.deepEqual(await service.availability(), {
    editors: [
      { id: 'vscode', name: 'Visual Studio Code' },
      { id: 'cursor', name: 'Cursor' },
    ],
    preferredEditorId: 'cursor',
  });
});

test('abre o caminho canônico usando o executável resolvido', async () => {
  const launches: Array<{ command: string; projectPath: string }> = [];
  const service = new ProjectEditorService({
    resolveExecutable: async (command) =>
      command === 'code' ? '/usr/local/bin/code' : null,
    launch: async (command, projectPath) => {
      launches.push({ command, projectPath });
    },
  });

  const result = await service.open('/projetos/painel', 'vscode');

  assert.deepEqual(launches, [{
    command: '/usr/local/bin/code',
    projectPath: '/projetos/painel',
  }]);
  assert.deepEqual(result, {
    editor: { id: 'vscode', name: 'Visual Studio Code' },
    opened: true,
  });
});

test('recusa editor fora do catálogo e editor indisponível', async () => {
  const service = new ProjectEditorService({
    resolveExecutable: async () => null,
  });

  await assert.rejects(
    service.open('/projetos/painel', 'terminal' as ProjectEditorId),
    (error: unknown) => error instanceof ProjectEditorError
      && error.code === 'EDITOR_NOT_AVAILABLE',
  );
  await assert.rejects(
    service.open('/projetos/painel', 'vscode'),
    (error: unknown) => error instanceof ProjectEditorError
      && error.code === 'EDITOR_NOT_AVAILABLE',
  );
});

test('traduz falha de inicialização sem expor detalhes do processo', async () => {
  const service = new ProjectEditorService({
    resolveExecutable: async () => '/bin/cursor',
    launch: async () => {
      throw new Error('segredo interno');
    },
  });

  await assert.rejects(
    service.open('/projetos/painel', 'cursor'),
    (error: unknown) => error instanceof ProjectEditorError
      && error.code === 'EDITOR_LAUNCH_FAILED'
      && !error.message.includes('segredo interno'),
  );
});
