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
  '| Serviço | Imagem / Base | Porta host | Descrição |',
  '| :--- | --- | ---: | :---: |',
  '| `web` | build local | 3000 | Rails server |',
  '| `db` | `postgres:17-alpine` | 5432 | PostgreSQL |',
  '',
  'Versões definidas em [.tool-versions](.tool-versions).',
  '',
  '[link inseguro](javascript:alert(1))',
].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  api.markdownFiles.mockResolvedValue({
    files: [
      {
        path: 'README.docker.md',
        name: 'README.docker.md',
        kind: 'file',
        language: 'markdown',
        size: markdown.length,
      },
    ],
    truncated: false,
  });
  api.file.mockResolvedValue({
    path: 'README.docker.md',
    name: 'README.docker.md',
    language: 'markdown',
    content: markdown,
    version: 'a'.repeat(64),
    size: markdown.length,
    modifiedAt: '2026-08-05T12:00:00.000Z',
    writable: true,
  });
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

  const projectFileLink = wrapper.get(
    'a[href="/projects/project-1/editor?file=.tool-versions"]',
  );
  assert.equal(projectFileLink.text(), '.tool-versions');
  assert.equal(wrapper.find('a[href^="javascript:"]').exists(), false);

  wrapper.unmount();
});
