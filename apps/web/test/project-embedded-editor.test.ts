import assert from 'node:assert/strict';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, test, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  directory: vi.fn(),
  file: vi.fn(),
  search: vi.fn(),
}));

const monaco = vi.hoisted(() => ({
  setModel: vi.fn(),
  createModel: vi.fn(() => ({ dispose: vi.fn() })),
  createEditor: vi.fn(() => ({
    setModel: monaco.setModel,
    setPosition: vi.fn(),
    revealPositionInCenter: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock('../src/api', () => ({
  fetchProjectDirectory: api.directory,
  fetchProjectFileContent: api.file,
  searchProjectFiles: api.search,
}));

vi.mock('monaco-editor', () => ({
  Uri: { parse: (value: string) => value },
  editor: {
    create: monaco.createEditor,
    createModel: monaco.createModel,
    setTheme: vi.fn(),
  },
}));

for (const worker of [
  'monaco-editor/editor/editor.worker?worker',
  'monaco-editor/language/css/css.worker?worker',
  'monaco-editor/language/html/html.worker?worker',
  'monaco-editor/language/json/json.worker?worker',
  'monaco-editor/language/typescript/ts.worker?worker',
]) {
  vi.mock(worker, () => ({ default: class MockWorker {} }));
}

import ProjectEmbeddedEditor from '../src/components/ProjectEmbeddedEditor.vue';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Painel',
  path: '/projetos/painel',
  type: 'node',
  source: 'workspace',
  favorite: false,
  capabilities: [],
};

function mountEditor() {
  return mount(ProjectEmbeddedEditor, {
    props: { project },
    global: {
      stubs: {
        ProjectEditorLauncher: {
          template: '<button class="local-editor-stub">Abrir localmente</button>',
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.directory.mockResolvedValue({
    path: '',
    entries: [
      { path: 'src', name: 'src', kind: 'directory' },
      {
        path: 'README.md',
        name: 'README.md',
        kind: 'file',
        language: 'markdown',
        size: 10,
      },
    ],
    truncated: false,
  });
  api.file.mockResolvedValue({
    path: 'README.md',
    name: 'README.md',
    language: 'markdown',
    content: '# Projeto\n',
    version: 'a'.repeat(64),
    size: 10,
    modifiedAt: '2026-08-03T12:00:00.000Z',
    writable: false,
  });
  api.search.mockResolvedValue({
    query: 'Projeto',
    items: [{
      path: 'README.md',
      name: 'README.md',
      language: 'markdown',
      line: 1,
      column: 3,
      preview: '# Projeto',
    }],
    truncated: false,
    scannedFiles: 1,
  });
});

test('carrega o explorer e abre um arquivo em modelo somente leitura', async () => {
  const wrapper = mountEditor();
  await flushPromises();
  await flushPromises();

  assert.equal(api.directory.mock.calls[0]?.[0], project.id);
  assert.match(wrapper.text(), /Somente leitura/);
  assert.match(wrapper.text(), /README\.md/);

  const fileButton = wrapper
    .findAll('.embedded-ide-tree-item')
    .find((button) => button.text().includes('README.md'));
  assert.ok(fileButton);
  await fileButton.trigger('click');
  await flushPromises();

  assert.equal(api.file.mock.calls[0]?.[1], 'README.md');
  assert.equal(monaco.createModel.mock.calls[0]?.[0], '# Projeto\n');
  assert.match(wrapper.get('.embedded-ide-statusbar').text(), /markdown/);
  wrapper.unmount();
});

test('busca no projeto e abre a ocorrência selecionada', async () => {
  const wrapper = mountEditor();
  await flushPromises();
  await wrapper.get('#embedded-ide-search-input').setValue('Projeto');
  await wrapper.get('.embedded-ide-search').trigger('submit');
  await flushPromises();

  assert.deepEqual(api.search.mock.calls[0], [project.id, 'Projeto']);
  assert.match(wrapper.text(), /Linha 1/);
  await wrapper.get('.embedded-ide-result').trigger('click');
  await flushPromises();
  assert.equal(api.file.mock.calls[0]?.[1], 'README.md');
  wrapper.unmount();
});
