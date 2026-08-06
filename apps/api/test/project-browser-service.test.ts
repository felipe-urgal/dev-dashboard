import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProjectBrowserError,
  ProjectBrowserService,
} from '../src/services/project-browser-service.js';

test('abre a URL resolvida usando o comando conhecido do sistema operacional (linux)', async () => {
  const launches: Array<{ executable: string; args: readonly string[] }> = [];
  const service = new ProjectBrowserService({
    platform: 'linux',
    resolveExecutable: async (command) =>
      command === 'xdg-open' ? '/usr/bin/xdg-open' : null,
    launch: async (executable, args) => {
      launches.push({ executable, args });
    },
  });

  const result = await service.open('server', 'http://localhost:3001');

  assert.deepEqual(launches, [
    {
      executable: '/usr/bin/xdg-open',
      args: ['http://localhost:3001'],
    },
  ]);
  assert.deepEqual(result, {
    target: 'server',
    url: 'http://localhost:3001',
    opened: true,
  });
});

test('usa o comando conhecido de mac (open)', async () => {
  const launches: Array<{ executable: string; args: readonly string[] }> = [];
  const service = new ProjectBrowserService({
    platform: 'darwin',
    resolveExecutable: async (command) =>
      command === 'open' ? '/usr/bin/open' : null,
    launch: async (executable, args) => {
      launches.push({ executable, args });
    },
  });

  await service.open('server', 'http://localhost:4000');

  assert.deepEqual(launches, [
    {
      executable: '/usr/bin/open',
      args: ['http://localhost:4000'],
    },
  ]);
});

test('trata o builtin start do cmd.exe como caso especial no windows', async () => {
  const launches: Array<{ executable: string; args: readonly string[] }> = [];
  const service = new ProjectBrowserService({
    platform: 'win32',
    environment: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    launch: async (executable, args) => {
      launches.push({ executable, args });
    },
  });

  await service.open('server', 'http://localhost:5000');

  assert.deepEqual(launches, [
    {
      executable: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/c', 'start', '', 'http://localhost:5000'],
    },
  ]);
});

test('recusa quando nenhum comando de abrir navegador está disponível', async () => {
  const service = new ProjectBrowserService({
    platform: 'linux',
    resolveExecutable: async () => null,
  });

  await assert.rejects(
    service.open('server', 'http://localhost:3001'),
    (error: unknown) =>
      error instanceof ProjectBrowserError &&
      error.code === 'BROWSER_NOT_AVAILABLE',
  );
});

test('recusa plataforma sem opener conhecido no catálogo', async () => {
  const service = new ProjectBrowserService({
    platform: 'aix',
  });

  await assert.rejects(
    service.open('server', 'http://localhost:3001'),
    (error: unknown) =>
      error instanceof ProjectBrowserError &&
      error.code === 'BROWSER_NOT_AVAILABLE',
  );
});

test('traduz falha de inicialização sem expor detalhes do processo', async () => {
  const service = new ProjectBrowserService({
    platform: 'linux',
    resolveExecutable: async () => '/usr/bin/xdg-open',
    launch: async () => {
      throw new Error('segredo interno');
    },
  });

  await assert.rejects(
    service.open('server', 'http://localhost:3001'),
    (error: unknown) =>
      error instanceof ProjectBrowserError &&
      error.code === 'BROWSER_LAUNCH_FAILED' &&
      !error.message.includes('segredo interno'),
  );
});
