import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectScriptCatalog } from '@dev-dashboard/contracts';

import ProjectDependenciesPanel from '../src/components/ProjectDependenciesPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(catalog: ProjectScriptCatalog): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/scripts/executions/latest')) {
      return jsonResponse({ execution: null });
    }
    if (path.endsWith('/scripts/executions')) {
      return jsonResponse({
        history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 },
      });
    }
    if (path.endsWith('/scripts')) return jsonResponse({ catalog });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  restoreFetch = () => { globalThis.fetch = originalFetch; };
}

test('mostra instalação e build do gerenciador Node detectado', async () => {
  installFetch({
    items: [
      {
        id: 'package-manager:install',
        name: 'Instalar dependências',
        description: 'Instala as dependências usando o lockfile do yarn.',
        command: 'yarn install',
        origin: 'package-manager',
        risk: 'mutable',
        enabled: true,
      },
      {
        id: 'package-script:build',
        name: 'build',
        description: 'Script declarado em scripts.build no package.json.',
        command: 'yarn build',
        origin: 'package-script',
        risk: 'mutable',
        enabled: true,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 2,
    totalPages: 1,
  });

  const wrapper = mount(ProjectDependenciesPanel, {
    props: { project: makeProject({ type: 'node', capabilities: ['scripts'] }) },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Node \/ Frontend/);
  assert.match(wrapper.text(), /Instalar dependências/);
  assert.match(wrapper.text(), /yarn install/);
  assert.match(wrapper.text(), /yarn build/);
  assert.equal(wrapper.get('.dependencies-panel').attributes('aria-busy'), 'false');
  assert.equal(wrapper.get('.dependencies-execution').attributes('aria-label'), 'Detalhes da execução');
  wrapper.unmount();
});

test('projeto Rails com frontend mostra Bundler e Node juntos', async () => {
  installFetch({
    items: [
      {
        id: 'bundler:check', name: 'Verificar gems',
        description: 'Confere as gems.', command: 'bundle check',
        origin: 'bundler', risk: 'read-only', enabled: true,
      },
      {
        id: 'bundler:install', name: 'Instalar gems',
        description: 'Instala gems.', command: 'bundle install',
        origin: 'bundler', risk: 'mutable', enabled: true,
      },
      {
        id: 'bundler:update', name: 'Atualizar gems',
        description: 'Atualiza gems.', command: 'bundle update',
        origin: 'bundler', risk: 'mutable', enabled: true,
      },
      {
        id: 'package-manager:install', name: 'Instalar dependências',
        description: 'Instala dependências Node.', command: 'npm install',
        origin: 'package-manager', risk: 'mutable', enabled: true,
      },
      {
        id: 'package-script:build', name: 'build',
        description: 'Gera o build.', command: 'npm run build',
        origin: 'package-script', risk: 'mutable', enabled: true,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 5,
    totalPages: 1,
  });

  const wrapper = mount(ProjectDependenciesPanel, {
    props: { project: makeProject({ type: 'rails', capabilities: ['scripts', 'bundler'] }) },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Ruby \/ Bundler/);
  assert.match(wrapper.text(), /Node \/ Frontend/);
  assert.match(wrapper.text(), /bundle check/);
  assert.match(wrapper.text(), /bundle update/);
  assert.match(wrapper.text(), /npm run build/);
  wrapper.unmount();
});
