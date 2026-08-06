import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildCatalog,
  createDocsServer,
  resolveDocumentPath,
  searchDocuments,
} from './docs-server.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-docs-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'docs', 'architecture'), { recursive: true });
  await mkdir(path.join(root, 'docs', 'site'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', 'site', 'index.html'),
    '<!doctype html><title>Docs</title>',
  );
  await writeFile(
    path.join(root, 'docs', 'index.md'),
    '# Documentação\n\nVisão profissional do projeto.\n',
  );
  await writeFile(
    path.join(root, 'docs', 'architecture', 'overview.md'),
    '# Arquitetura\n\nFluxo seguro da API Fastify.\n\n## Camadas\n',
  );
  await writeFile(path.join(root, 'README.md'), '# Projeto\n\nIntrodução.\n');
  return root;
}

test('cataloga documentos e preserva a ordem principal', async (t) => {
  const root = await fixture(t);
  const catalog = await buildCatalog(root);
  assert.equal(catalog.defaultDocument, 'docs/index.md');
  assert.equal(catalog.pages[0].path, 'docs/index.md');
  assert.ok(
    catalog.pages.some((page) => page.path === 'docs/architecture/overview.md'),
  );
  assert.equal(
    catalog.pages.find((page) => page.path === 'docs/architecture/overview.md')
      ?.group,
    'Arquitetura',
  );
});

test('rejeita traversal e arquivos fora do catálogo', async (t) => {
  const root = await fixture(t);
  const catalog = await buildCatalog(root);
  await assert.rejects(
    () => resolveDocumentPath(root, '../segredo.md', catalog),
    /fora do escopo/,
  );
  await assert.rejects(
    () => resolveDocumentPath(root, 'docs/inexistente.md', catalog),
    /não catalogado/,
  );
});

test('busca por título, heading e conteúdo', async (t) => {
  const root = await fixture(t);
  const catalog = await buildCatalog(root);
  const results = await searchDocuments(root, catalog, 'Fastify');
  assert.equal(results[0].path, 'docs/architecture/overview.md');
  assert.match(results[0].snippet, /Fastify/);
});

test('expõe health, catálogo, conteúdo e busca pela API local', async (t) => {
  const root = await fixture(t);
  const docs = createDocsServer({ rootDirectory: root, port: 0 });
  const address = await docs.listen();
  t.after(async () => docs.close());

  const health = await fetch(`${address.url}/api/health`).then((response) =>
    response.json(),
  );
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'dev-dashboard-docs');

  const catalog = await fetch(`${address.url}/api/docs`).then((response) =>
    response.json(),
  );
  assert.equal(catalog.defaultDocument, 'docs/index.md');

  const contentResponse = await fetch(
    `${address.url}/api/docs/content?path=${encodeURIComponent('docs/index.md')}`,
  );
  assert.equal(contentResponse.status, 200);
  const content = await contentResponse.json();
  assert.match(content.markdown, /Visão profissional/);

  const search = await fetch(`${address.url}/api/search?q=seguro`).then(
    (response) => response.json(),
  );
  assert.equal(search.results[0].path, 'docs/architecture/overview.md');
});
