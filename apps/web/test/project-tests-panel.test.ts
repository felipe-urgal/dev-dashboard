import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type { ProjectTestOverview } from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const baseOverview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'node-script-test',
      runner: 'vitest',
      label: 'npm run test',
      description: 'Executa o script `test` do package.json.',
      origin: 'package-script',
      originDetail: 'scripts.test',
      priority: 10,
      supportsFileTarget: true,
    },
  ],
};

let cleanup: (() => void) | undefined;
beforeEach(() => { cleanup = undefined; });
afterEach(() => { cleanup?.(); });

test('exibe o botão "Executar arquivo" quando o comando suporta arquivo específico', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const buttons = wrapper.findAll('button');
  assert.ok(buttons.some((button) => button.text() === 'Executar arquivo'));
});

test('lista arquivos ao abrir o seletor e inicia a execução do arquivo escolhido', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname);
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/files')) {
      return new Response(JSON.stringify({ files: [{ path: 'src/app.test.ts' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/files/start')) {
      return new Response(JSON.stringify({ process: { id: 'node-script-test:file', projectId: 'p1', kind: 'test', status: 'running', command: 'npm', args: ['run', 'test', '--', 'src/app.test.ts'] } }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const toggleButton = wrapper.findAll('button').find((button) => button.text() === 'Executar arquivo');
  await toggleButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(calls.some((path) => path.endsWith('/node-script-test/files')));

  const select = wrapper.find('.tests-file-picker select');
  assert.ok(select.exists());
  await select.setValue('src/app.test.ts');

  const startFileButton = wrapper.findAll('button').find((button) => button.text().includes('Executar arquivo selecionado'));
  await startFileButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(calls.some((path) => path.endsWith('/files/start')));
  assert.match(wrapper.text(), /Executando|Iniciando/);
});

test('mostra erro específico quando a listagem de arquivos falha', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/files')) {
      return new Response(JSON.stringify({ error: 'TEST_COMMAND_NOT_FOUND', message: 'Comando de teste não encontrado para este projeto.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const toggleButton = wrapper.findAll('button').find((button) => button.text() === 'Executar arquivo');
  await toggleButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Comando de teste não encontrado/);
});
