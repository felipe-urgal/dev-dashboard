import assert from 'node:assert/strict';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, test, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  directory: vi.fn(),
  file: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
}));

const monaco = vi.hoisted(() => {
  const state: {
    value: string;
    listener: (() => void) | undefined;
  } = { value: '', listener: undefined };
  const model = {
    dispose: vi.fn(),
    getValue: vi.fn(() => state.value),
    setValue: vi.fn((value: string) => {
      state.value = value;
      state.listener?.();
    }),
    onDidChangeContent: vi.fn((listener: () => void) => {
      state.listener = listener;
      return { dispose: vi.fn() };
    }),
  };
  const setModel = vi.fn();
  const updateOptions = vi.fn();
  return {
    state,
    model,
    setModel,
    updateOptions,
    createModel: vi.fn((
      content: string,
      _language: string,
      _uri: unknown,
    ) => {
      state.value = content;
      return model;
    }),
    createEditor: vi.fn(() => ({
      setModel,
      updateOptions,
      setPosition: vi.fn(),
      revealPositionInCenter: vi.fn(),
      focus: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

vi.mock('../src/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    code?: string;
  },
  fetchProjectDirectory: api.directory,
  fetchProjectFileContent: api.file,
  saveProjectFileContent: api.save,
  searchProjectFiles: api.search,
}));

vi.mock('monaco-editor', () => ({
  __v_isRef: false,
  Uri: { parse: (value: string) => value },
  editor: {
    create: monaco.createEditor,
    createModel: monaco.createModel,
    setTheme: vi.fn(),
  },
}));

vi.mock('monaco-editor/editor/editor.worker?worker', () => ({
  default: class MockEditorWorker {},
}));

vi.mock('monaco-editor/language/css/css.worker?worker', () => ({
  default: class MockCssWorker {},
}));

vi.mock('monaco-editor/language/html/html.worker?worker', () => ({
  default: class MockHtmlWorker {},
}));

vi.mock('monaco-editor/language/json/json.worker?worker', () => ({
  default: class MockJsonWorker {},
}));

vi.mock('monaco-editor/language/typescript/ts.worker?worker', () => ({
  default: class MockTypeScriptWorker {},
}));

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

function openedFile(content = '# Projeto\n') {
  return {
    path: 'README.md',
    name: 'README.md',
    language: 'markdown',
    content,
    version: 'a'.repeat(64),
    size: content.length,
    modifiedAt: '2026-08-03T12:00:00.000Z',
    writable: true,
  };
}

async function openReadme(wrapper: ReturnType<typeof mountEditor>) {
  const fileButton = wrapper
    .findAll('.embedded-ide-tree-item')
    .find((button) => button.text().includes('README.md'));
  assert.ok(fileButton);
  await fileButton.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  monaco.state.value = '';
  monaco.state.listener = undefined;
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
  api.file.mockResolvedValue(openedFile());
  api.save.mockResolvedValue({
    ...openedFile('# Projeto alterado\n'),
    version: 'b'.repeat(64),
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

test('carrega o explorer e abre um arquivo editável', async () => {
  const wrapper = mountEditor();
  await flushPromises();
  await flushPromises();

  assert.equal(api.directory.mock.calls[0]?.[0], project.id);
  assert.match(wrapper.text(), /README\.md/);
  await openReadme(wrapper);

  assert.equal(api.file.mock.calls[0]?.[1], 'README.md');
  assert.equal(monaco.createModel.mock.calls[0]?.[0], '# Projeto\n');
  assert.deepEqual(monaco.updateOptions.mock.calls.at(-1)?.[0], {
    readOnly: false,
  });
  assert.match(wrapper.text(), /Edição segura/);
  assert.match(wrapper.get('.embedded-ide-statusbar').text(), /markdown/);
  wrapper.unmount();
});

test('marca a aba como alterada e salva com a versão aberta', async () => {
  const wrapper = mountEditor();
  await flushPromises();
  await openReadme(wrapper);

  monaco.state.value = '# Projeto alterado\n';
  monaco.state.listener?.();
  await flushPromises();

  assert.match(wrapper.get('.embedded-ide-statusbar').text(), /Alterações não salvas/);
  assert.equal(wrapper.get('.embedded-ide-save').attributes('disabled'), undefined);
  await wrapper.get('.embedded-ide-save').trigger('click');
  await flushPromises();

  assert.deepEqual(api.save.mock.calls[0], [
    project.id,
    {
      path: 'README.md',
      content: '# Projeto alterado\n',
      expectedVersion: 'a'.repeat(64),
    },
  ]);
  assert.match(wrapper.text(), /README\.md salvo/);
  assert.ok(wrapper.get('.embedded-ide-save').attributes('disabled') !== undefined);
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
