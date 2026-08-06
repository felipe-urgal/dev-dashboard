import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectTestOverview } from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';
import { createTestRouter } from './support/test-router';

const overview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'node-script-test',
      runner: 'vitest',
      label: 'npm run test',
      description: 'Executa o script de testes.',
      origin: 'package-script',
      originDetail: 'scripts.test',
      priority: 10,
      supportsFileTarget: true,
    },
  ],
};

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('mostra alterações da branch e os testes relacionados encontrados', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname);
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: overview });
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: null });
    if (url.pathname.endsWith('/related')) {
      return jsonResponse({
        related: {
          baseBranch: 'main',
          currentBranch: 'feature/checkout',
          changedFiles: ['src/services/auth.ts', 'src/ui/button.tsx'],
          testFiles: [
            { path: 'src/services/auth.test.ts' },
            { path: 'src/ui/button.spec.tsx' },
          ],
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const options = wrapper
    .findAll('.tests-execution-select option')
    .map((option) => option.text());
  assert.ok(
    options.some((option) => option.includes('Vitest — alterações da branch')),
  );

  await wrapper
    .find('.tests-execution-select')
    .setValue('node-script-test::related');
  await flushPromises();
  await flushPromises();

  assert.ok(
    calls.some((path) => path.endsWith('/tests/node-script-test/related')),
  );
  assert.match(wrapper.text(), /main → feature\/checkout/);
  assert.match(wrapper.text(), /2 arquivos modificados/);
  assert.match(wrapper.text(), /2 testes relacionados/);
  assert.match(wrapper.text(), /src\/services\/auth\.test\.ts/);

  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  assert.equal(executeButton.attributes('disabled'), undefined);
});

test('não habilita a suíte completa quando não há teste relacionado', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: overview });
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: null });
    if (url.pathname.endsWith('/related')) {
      return jsonResponse({
        related: {
          baseBranch: 'main',
          currentBranch: 'feature/docs',
          changedFiles: ['README.md'],
          testFiles: [],
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  await wrapper
    .find('.tests-execution-select')
    .setValue('node-script-test::related');
  await flushPromises();
  await flushPromises();

  assert.match(
    wrapper.text(),
    /A suíte completa não será executada automaticamente/,
  );
  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  assert.notEqual(executeButton.attributes('disabled'), undefined);
});
