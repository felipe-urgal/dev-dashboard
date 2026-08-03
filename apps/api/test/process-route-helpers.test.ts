import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Project, ProjectComposeOverview } from '@dev-dashboard/contracts';

import { describeDockerPortConflict } from '../src/routes/processes/helpers.js';
import type { DockerComposeService } from '../src/services/docker-compose-service.js';

const project: Project = {
  id: 'painel',
  name: 'painel',
  path: '/tmp/painel',
  type: 'node',
  source: 'standalone',
  favorite: false,
  capabilities: ['server', 'docker'],
};

function serviceWith(ports: string[], running = true): DockerComposeService {
  const overview: ProjectComposeOverview = {
    configured: true,
    dockerAvailable: true,
    composeFile: 'docker-compose.dev.yml',
    services: [{
      name: 'app',
      requiresBuild: false,
      ports,
      dependsOn: [],
      running,
    }],
  };

  return {
    overview: async () => overview,
  } as DockerComposeService;
}

test('descreve conflito para formatos Compose com ou sem IP do host', async () => {
  for (const mapping of [
    '3000:3000',
    '127.0.0.1:3000:3000',
    '[::1]:3000:3000',
    '3000:3000/tcp',
  ]) {
    const message = await describeDockerPortConflict(
      serviceWith([mapping]),
      project,
      3000,
    );

    assert.match(message ?? '', /container Docker "app"/);
  }
});

test('ignora porta apenas interna, serviço parado e porta publicada diferente', async () => {
  assert.equal(
    await describeDockerPortConflict(serviceWith(['3000']), project, 3000),
    undefined,
  );
  assert.equal(
    await describeDockerPortConflict(serviceWith(['3000:3000'], false), project, 3000),
    undefined,
  );
  assert.equal(
    await describeDockerPortConflict(serviceWith(['3100:3000']), project, 3000),
    undefined,
  );
});

test('preserva o erro original quando a consulta ao Docker falha', async () => {
  const dockerComposeService = {
    overview: async () => {
      throw new Error('Docker indisponível');
    },
  } as DockerComposeService;

  assert.equal(
    await describeDockerPortConflict(dockerComposeService, project, 3000),
    undefined,
  );
});
