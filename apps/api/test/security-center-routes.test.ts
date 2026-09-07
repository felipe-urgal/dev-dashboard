import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import type {
  SecurityScanExecution,
  SecurityScannerAvailability,
  SecurityScannerProvider,
} from '../src/services/security-scanner-provider.js';
import type { SecurityScanResult } from '../src/services/trivy-security-scanner.js';

const TOKEN = 's'.repeat(64);
const OBSERVED_AT = '2026-09-07T12:00:00.000Z';

class StubSecurityScannerProvider
  implements SecurityScannerProvider<SecurityScanResult>
{
  public readonly id = 'trivy';
  public availabilityResult: SecurityScannerAvailability = {
    state: 'available',
    observedAt: OBSERVED_AT,
    version: '0.66.0',
  };
  public scanResult: SecurityScanExecution<SecurityScanResult> = {
    state: 'completed',
    observedAt: OBSERVED_AT,
    result: {
      provider: 'trivy',
      observedAt: OBSERVED_AT,
      findings: [],
    },
  };
  public scannedProjects: Project[] = [];

  public async availability(): Promise<SecurityScannerAvailability> {
    return this.availabilityResult;
  }

  public async scan(
    project: Project,
  ): Promise<SecurityScanExecution<SecurityScanResult>> {
    this.scannedProjects.push(project);
    return this.scanResult;
  }
}

function project(): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: '/tmp/dev-dashboard-security-project',
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: [],
  };
}

async function createFixture() {
  const context = createAppContext();
  const knownProject = project();
  context.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/tmp',
    projects: [knownProject],
    warnings: [],
  });
  const provider = new StubSecurityScannerProvider();
  const app = await buildApp({
    localToken: TOKEN,
    context,
    securityScannerProvider: provider,
  });
  return { app, provider, knownProject };
}

test('Security Center expõe availability autenticada sem executar scan', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const unauthorized = await fixture.app.inject({
    method: 'GET',
    url: '/api/security-center/availability',
  });
  assert.equal(unauthorized.statusCode, 401);

  const response = await fixture.app.inject({
    method: 'GET',
    url: '/api/security-center/availability',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    provider: 'trivy',
    availability: {
      state: 'available',
      observedAt: OBSERVED_AT,
      version: '0.66.0',
    },
  });
  assert.equal(fixture.provider.scannedProjects.length, 0);
});

test('Security Center preserva scanner ausente como capability opcional', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());
  fixture.provider.availabilityResult = {
    state: 'missing',
    observedAt: OBSERVED_AT,
    diagnostic: 'Trivy não está instalado ou não está disponível no PATH da API.',
  };

  const response = await fixture.app.inject({
    method: 'GET',
    url: '/api/security-center/availability',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().availability.state, 'missing');
});

test('scan resolve somente o Project conhecido pelo backend', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/security-center/scan',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().execution.state, 'completed');
  assert.equal(fixture.provider.scannedProjects.length, 1);
  assert.equal(fixture.provider.scannedProjects[0], fixture.knownProject);
});

test('scan rejeita target/path/argv controlado pelo browser', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/project-1/security-center/scan',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: { path: '/etc', executable: '/bin/sh', args: ['-c', 'id'] },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(fixture.provider.scannedProjects.length, 0);
});

test('scan retorna 404 sem chamar provider para projeto inexistente', async (context) => {
  const fixture = await createFixture();
  context.after(() => fixture.app.close());

  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/projects/missing/security-center/scan',
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
    payload: {},
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'PROJECT_NOT_FOUND');
  assert.equal(fixture.provider.scannedProjects.length, 0);
});
