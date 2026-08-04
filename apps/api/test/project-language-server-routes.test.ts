import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'l'.repeat(64);

interface StatusResponse {
  kind: string;
  supported: boolean;
  available: boolean;
  state: string;
  rails?: { addonAvailable: boolean; runtimeState: string; message: string };
}
interface ConfirmationResponse { confirmation: { token: string; expiresAt: string } }
interface ErrorResponse { error?: string }

test('rotas do gateway de servidor de linguagem (status por kind e opt-in Rails runtime)', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-lsp-routes-'));
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });
  await writeFile(path.join(projectPath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(
    path.join(projectPath, 'Gemfile.lock'),
    'GEM\n  remote: https://rubygems.org/\n  specs:\n    ruby-lsp (0.20.0)\n    ruby-lsp-rails (0.3.0)\n\nPLATFORMS\n  ruby\n',
  );

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const { ProjectLanguageServerService } = await import(
    '../src/services/project-language-server-service.js'
  );

  const appContext = createAppContext();
  const project: Project = {
    id: 'p1', name: 'sample', path: projectPath,
    type: 'rails', source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1', workspacePath: fixtureRoot, projects: [project], warnings: [],
  });

  const projectLanguageServerService = new ProjectLanguageServerService({
    findCommand: async () => undefined,
  });

  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
    projectLanguageServerService,
  });
  context.after(async () => {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('status javascript-typescript não suportado para projeto Rails', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/language-server/javascript-typescript',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const status = response.json<StatusResponse>();
    assert.equal(status.kind, 'javascript-typescript');
    assert.equal(status.supported, false);
  });

  await context.test('status ruby reconhece Gemfile e reporta add-on Rails resolvido', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/language-server/ruby',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const status = response.json<StatusResponse>();
    assert.equal(status.kind, 'ruby');
    assert.equal(status.supported, true);
    assert.equal(status.rails?.addonAvailable, true);
    assert.equal(status.rails?.runtimeState, 'disabled');
  });

  await context.test('kind inválido é rejeitado pelo schema', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/language-server/python',
      headers,
    });
    assert.equal(response.statusCode, 400);
  });

  await context.test('projeto inexistente retorna 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/language-server/ruby',
      headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('habilitar Rails runtime sem token de confirmação é recusado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/language-server/ruby/rails-runtime',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { enabled: true },
    });
    assert.equal(response.statusCode, 409);
  });

  await context.test('fluxo completo: preparar confirmação e habilitar Rails runtime', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/language-server/ruby/rails-runtime/confirmations',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {},
    });
    assert.equal(confirmationResponse.statusCode, 201);
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    assert.equal(confirmation.token.length, 64);

    const enableResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/language-server/ruby/rails-runtime',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { enabled: true, confirmationToken: confirmation.token },
    });
    assert.equal(enableResponse.statusCode, 200);
    const enabledStatus = enableResponse.json<StatusResponse>();
    assert.equal(enabledStatus.rails?.runtimeState, 'enabled');

    const reuseResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/language-server/ruby/rails-runtime',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { enabled: true, confirmationToken: confirmation.token },
    });
    assert.equal(reuseResponse.statusCode, 409);

    const disableResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/language-server/ruby/rails-runtime',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { enabled: false },
    });
    assert.equal(disableResponse.statusCode, 200);
    assert.equal(
      disableResponse.json<StatusResponse>().rails?.runtimeState,
      'disabled',
    );
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/language-server/ruby',
    });
    assert.equal(response.statusCode, 401);
  });
});
