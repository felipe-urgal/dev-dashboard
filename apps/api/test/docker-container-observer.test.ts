import assert from 'node:assert/strict';
import test from 'node:test';

import { DockerContainerObserver } from '../src/services/docker-container-observer.js';

test('Docker observer reads running/exited containers without claiming ownership', async () => {
  const observer = new DockerContainerObserver({
    platform: 'linux',
    runDocker: async () => [
      JSON.stringify({ ID: 'a'.repeat(64), Names: 'loto-lab-app', State: 'running' }),
      JSON.stringify({ ID: 'b'.repeat(64), Names: 'test-db', State: 'exited' }),
      JSON.stringify({ ID: 'c'.repeat(64), Names: 'failed-container', State: 'dead' }),
    ].join('\n'),
  });
  const result = await observer.inspect();
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.containers.map((container) => container.state),
    ['running', 'stopped', 'failed']);
  assert.equal(result.containers[0]?.name, 'loto-lab-app');
});

test('Docker observer bounds output and does not leak errors or malformed records', async () => {
  const observer = new DockerContainerObserver({
    platform: 'linux',
    limit: 1,
    runDocker: async () => [
      JSON.stringify({ ID: 'a'.repeat(64), Names: 'app', State: 'running' }),
      JSON.stringify({ ID: 'b'.repeat(64), Names: 'db', State: 'running' }),
    ].join('\n'),
  });
  assert.deepEqual((await observer.inspect()).containers.map((item) => item.name), ['app']);
  assert.equal((await observer.inspect()).truncated, true);

  const broken = new DockerContainerObserver({
    platform: 'linux',
    runDocker: async () => {
      throw new Error('top secret command output');
    },
  });
  const failed = await broken.inspect();
  assert.equal(failed.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(failed), /secret/);

  const malformed = new DockerContainerObserver({
    platform: 'linux',
    runDocker: async () => '{invalid',
  });
  assert.equal((await malformed.inspect()).status, 'unavailable');
});

test('Docker observer does not invoke CLI off Linux', async () => {
  let invoked = false;
  const observer = new DockerContainerObserver({
    platform: 'darwin',
    runDocker: async () => {
      invoked = true;
      return '';
    },
  });
  assert.equal((await observer.inspect()).status, 'unsupported');
  assert.equal(invoked, false);
});
