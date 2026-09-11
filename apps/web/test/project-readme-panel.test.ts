import assert from 'node:assert/strict';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, test, vi } from 'vitest';

import ProjectReadmePanel from '../src/components/ProjectReadmePanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const api = vi.hoisted(() => ({
  markdownFiles: vi.fn(),
  file: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectMarkdownFiles: api.markdownFiles,
  fetchProjectFileContent: api.file,
}));

const markdown = [
  '# Rodando o projeto com Docker',
  '',
  'Consulte a [documentação do Docker](https://docs.docker.com) antes de começar.',
  '',
  '## Como rodar',
  '',
  '```bash',
  'npm run test',
  '```',
  '',
  '| Serviço | Imagem / Base | Porta host | Descrição |',
  '| :--- | --- | ---: | :---: |',
  '| `web` | build local | 3000 | Rails server |',
  '| `db` | `postgres:17-alpine` | 5432 | PostgreSQL |',
  '',
  '### Detalhes',
  '',
  'Versões definidas em [.tool-versions](.tool-versions).',
  '',
  '[link inseguro](javascript:alert(1))',
].join('\n');

const markdownFilesResult = {
  files: [
    {
      path: 'README.docker.md',
      name: 'README.docker.md',
      kind: 'file',
      language: 'markdown',
      size: markdown.length,
    },
    {
      path: 'docs/setup.md',
      name: 'setup.md',
      kind: 'file',
      language: 'markdown',
      size: markdown.length,
    },
    {
      path: 'node_modules/example/README.md',
      name: 'README.md',
      kind: 'file',
      language: 'markdown',
      size: markdown.length,
    },
  ],
  truncated: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.markdownFiles.mockResolvedValue(markdownFilesResult);
  api.file.mockImplementation(async (_projectId: string, path: string) => ({
    path,
    name: path.split('/').at(-1) ?? path,
    language: 'markdown',
    content: markdown,
    version: 'a'.repeat(64),
    size: markdown.length,
    modifiedAt: '2026-08-05T12:00:00.000Z',
    writable: true,
  }));
});

test('organiza arquivos, documento e índice no workspace de README', async () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });

  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, {
    props: { project },
    attachTo: document.body,
  });
  await flushPromises();
  await flushPromises();

  assert.equal(wrapper.find('.readme-workspace').exists(), true);
  assert.equal(wrapper.find('.readme-file-list').exists(), false);
  assert.equal(
    wrapper.get('.readme-project-files').findAll('.readme-file-item').length,
    2,
  );
  assert.equal(wrapper.get('.readme-dependency-summary-count').text(), '1');
  assert.ok(
    wrapper.get('.readme-breadcrumb').text().includes('README.docker.md'),
  );
  assert.equal(wrapper.get('.readme-readonly-label').text(), 'Somente leitura');

  const outlineButtons = wrapper.findAll('.readme-outline-button');
  assert.deepEqual(
    outlineButtons.map((button) => button.text()),
    ['Rodando o projeto com Docker', 'Como rodar', 'Detalhes'],
  );
  assert.equal(wrapper.findAll('.readme-heading').length, 3);
  assert.ok(
    wrapper
      .findAll('.readme-heading')
      .every((heading) =>
        heading.attributes('id')?.startsWith('readme-heading-'),
      ),
  );

  await outlineButtons[1]?.trigger('click');
  assert.equal(scrollIntoView.mock.calls.length, 1);
  assert.ok(
    outlineButtons[1]?.classes().includes('readme-outline-button-active'),
  );

  const dependencyDetails = wrapper.get('.readme-dependency-group');
  (dependencyDetails.element as HTMLDetailsElement).open = true;
  await dependencyDetails.trigger('toggle');

  const dependencyButton = wrapper
    .get('.readme-dependency-files')
    .get('.readme-file-item');
  await dependencyButton.trigger('click');
  await flushPromises();

  assert.deepEqual(api.file.mock.calls.at(-1)?.slice(0, 2), [
    'project-1',
    'node_modules/example/README.md',
  ]);
  assert.ok(dependencyButton.classes().includes('readme-file-item-active'));

  wrapper.unmount();
});

test('renderiza tabelas GFM, links seguros e código inline do README', async () => {
  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, { props: { project } });
  await flushPromises();
  await flushPromises();

  const table = wrapper.get('.readme-table');
  assert.equal(table.findAll('thead th').length, 4);
  assert.equal(table.findAll('tbody tr').length, 2);
  assert.equal(table.findAll('tbody td').length, 8);
  assert.ok(
    table.findAll('.readme-inline-code').some((node) => node.text() === 'web'),
  );
  assert.ok(
    table
      .findAll('.readme-inline-code')
      .some((node) => node.text() === 'postgres:17-alpine'),
  );
  assert.ok(
    table
      .findAll('thead th')[2]
      ?.classes()
      .includes('readme-table-align-right'),
  );
  assert.ok(
    table
      .findAll('thead th')[3]
      ?.classes()
      .includes('readme-table-align-center'),
  );

  const externalLink = wrapper.get('a[href="https://docs.docker.com"]');
  assert.equal(externalLink.attributes('target'), '_blank');
  assert.equal(externalLink.attributes('rel'), 'noreferrer noopener');

  assert.ok(wrapper.text().includes('.tool-versions'));
  assert.equal(wrapper.findAll('a').length, 1);
  assert.equal(wrapper.find('a[href^="javascript:"]').exists(), false);

  wrapper.unmount();
});

test('copia um bloco de código renderizado pelo documento', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });

  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, { props: { project } });
  await flushPromises();
  await flushPromises();

  const copyButton = wrapper.get('.readme-code-toolbar button');
  await copyButton.trigger('click');
  await flushPromises();

  assert.equal(writeText.mock.calls.length, 1);
  assert.ok(String(writeText.mock.calls[0]?.[0]).includes('npm run test'));
  assert.ok(copyButton.text().includes('Copiado'));

  wrapper.unmount();
});

test('mostra aviso de truncamento e atualiza a listagem pelo explorador', async () => {
  api.markdownFiles.mockResolvedValue({
    ...markdownFilesResult,
    truncated: true,
  });

  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, { props: { project } });
  await flushPromises();
  await flushPromises();

  assert.ok(
    wrapper
      .get('.readme-truncated-warning')
      .text()
      .includes('lista foi limitada'),
  );

  await wrapper.get('.readme-browser-refresh').trigger('click');
  await flushPromises();
  await flushPromises();

  assert.equal(api.markdownFiles.mock.calls.length, 2);
  assert.equal(wrapper.find('.readme-document').exists(), true);

  wrapper.unmount();
});

test('mostra estado vazio quando o projeto não possui Markdown', async () => {
  api.markdownFiles.mockResolvedValue({ files: [], truncated: false });

  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, { props: { project } });
  await flushPromises();

  assert.ok(
    wrapper
      .get('.readme-state')
      .text()
      .includes('Nenhum arquivo Markdown encontrado'),
  );
  assert.ok(
    wrapper
      .get('.readme-file-group-empty')
      .text()
      .includes('Nenhum Markdown do projeto'),
  );
  assert.equal(wrapper.find('.readme-reader-header').exists(), false);

  wrapper.unmount();
});

test('mantém erro explícito e permite recarregar a documentação', async () => {
  api.markdownFiles
    .mockReset()
    .mockRejectedValueOnce(new Error('Falha ao listar Markdown'))
    .mockResolvedValueOnce(markdownFilesResult);

  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, { props: { project } });
  await flushPromises();

  assert.ok(
    wrapper
      .get('.readme-state-error')
      .text()
      .includes('Falha ao listar Markdown'),
  );

  await wrapper.get('.secondary-button').trigger('click');
  await flushPromises();
  await flushPromises();

  assert.equal(api.markdownFiles.mock.calls.length, 2);
  assert.ok(wrapper.find('.readme-state-error').exists() === false);
  assert.equal(wrapper.find('.readme-document').exists(), true);

  wrapper.unmount();
});

test('expõe erro ao trocar para um arquivo que não pode ser lido', async () => {
  api.file.mockImplementation(async (_projectId: string, path: string) => {
    if (path === 'docs/setup.md') throw new Error('Falha ao abrir Markdown');
    return {
      path,
      name: path.split('/').at(-1) ?? path,
      language: 'markdown',
      content: markdown,
      version: 'a'.repeat(64),
      size: markdown.length,
      modifiedAt: '2026-08-05T12:00:00.000Z',
      writable: true,
    };
  });

  const project = makeProject({ id: 'project-1' });
  const wrapper = mount(ProjectReadmePanel, { props: { project } });
  await flushPromises();
  await flushPromises();

  const projectButtons = wrapper
    .get('.readme-project-files')
    .findAll('.readme-file-item');
  await projectButtons[1]?.trigger('click');
  await flushPromises();

  assert.ok(
    wrapper
      .get('.readme-state-error')
      .text()
      .includes('Falha ao abrir Markdown'),
  );
  assert.equal(wrapper.find('.readme-document').exists(), false);

  wrapper.unmount();
});
