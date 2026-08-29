import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import {
  registerStaticDashboard,
  validateDashboardBuild,
} from '../src/http/static-dashboard.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-static-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(
    path.join(root, 'index.html'),
    '<script src="/assets/app-abc123.js"></script>',
  );
  await writeFile(path.join(root, 'assets/app-abc123.js'), 'console.log("ok")');
  return root;
}

test('serve HTML, asset versionado e fallback com caches distintos', async (context) => {
  const root = await fixture();
  const app = Fastify({ logger: false });
  app.get('/api/known', async () => ({ ok: true }));
  await registerStaticDashboard(app, root);
  context.after(async () => {
    await app.close();
    await rm(root, { recursive: true });
  });
  const html = await app.inject({ url: '/', headers: { accept: 'text/html' } });
  assert.equal(html.statusCode, 200);
  assert.equal(html.headers['cache-control'], 'no-cache');
  const asset = await app.inject({ url: '/assets/app-abc123.js' });
  assert.equal(asset.statusCode, 200);
  assert.match(String(asset.headers['cache-control']), /immutable/);
  assert.equal(
    (
      await app.inject({
        url: '/projects/um',
        headers: { accept: 'text/html' },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: '/assets/missing.js',
        headers: { accept: 'text/html' },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/projects/um',
        headers: { accept: 'text/html' },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        url: '/api/missing',
        headers: { accept: 'text/html' },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({ url: '/api/known', headers: { accept: 'text/html' } })
    ).json().ok,
    true,
  );
});

test('rejeita URI malformada sem converter erro de cliente em 500', async (context) => {
  const root = await fixture();
  const app = Fastify({ logger: false });
  await registerStaticDashboard(app, root);
  context.after(async () => {
    await app.close();
    await rm(root, { recursive: true });
  });

  const response = await app.inject({
    url: '/%E0%A4%A',
    headers: { accept: 'text/html' },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: 'INVALID_PATH',
    message: 'Caminho inválido.',
  });
});

test('falha para build ausente, sem index ou sem asset obrigatório', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-invalid-'));
  await assert.rejects(
    validateDashboardBuild(path.join(root, 'ausente')),
    /diretório/,
  );
  await assert.rejects(validateDashboardBuild(root), /index\.html/);
  await writeFile(
    path.join(root, 'index.html'),
    '<script src="/assets/missing.js"></script>',
  );
  await assert.rejects(validateDashboardBuild(root), /Asset obrigatório/);
  await rm(root, { recursive: true });
});
