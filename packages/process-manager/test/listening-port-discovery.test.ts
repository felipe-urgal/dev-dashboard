import assert from 'node:assert/strict';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProcessManager } from '../src/index.js';
import { parseListeningPortsFromProcNet } from '../src/listening-port-discovery.js';

async function findAvailableFixedPort(
  excludedPorts: ReadonlySet<number> = new Set<number>(),
): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer();

      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();

        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Não foi possível reservar uma porta TCP.'));
          return;
        }

        server.close((error) => {
          if (error) reject(error);
          else resolve(address.port);
        });
      });
    });

    if (port > 3_999 && !excludedPorts.has(port)) {
      return port;
    }
  }

  throw new Error(
    'Não foi possível encontrar uma porta fixa fora da faixa automática.',
  );
}

async function listenOnPort(
  port: number,
): Promise<ReturnType<typeof createServer>> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}

async function closeServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test('parses only LISTEN ports owned by the supplied socket inodes', () => {
  const procNet = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:1450 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 4242 1',
    '   1: 0100007F:1451 00000000:0000 01 00000000:00000000 00:00000000 00000000  1000        0 4243 1',
    '   2: 0100007F:1452 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 9999 1',
    '',
  ].join('\n');

  const ports = parseListeningPortsFromProcNet(
    procNet,
    new Set(['4242', '4243']),
  );

  assert.deepEqual(ports, [5_200]);
});

test(
  'adopts the actual listening port when a node server ignores PORT',
  { skip: process.platform !== 'linux' },
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), 'dev-dashboard-port-discovery-'),
    );
    const projectPath = path.join(fixtureRoot, 'project');
    const stateDirectory = path.join(fixtureRoot, 'state');
    const fixedPort = await findAvailableFixedPort();
    const expectedPort = await findAvailableFixedPort(new Set([fixedPort]));

    await mkdir(projectPath, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          name: 'fixed-port-fixture',
          scripts: { dev: 'node server.js' },
        }),
      ),
      writeFile(
        path.join(projectPath, 'server.js'),
        [
          "const http = require('node:http');",
          `const port = ${fixedPort};`,
          "http.createServer((_request, response) => response.end('ok')).listen(port, '127.0.0.1');",
          '',
        ].join('\n'),
      ),
    ]);

    const project: Project = {
      id: 'fixed-port-fixture',
      name: 'Fixed port fixture',
      path: projectPath,
      type: 'node',
      source: 'workspace',
      enabled: true,
      capabilities: ['server'],
    };
    const manager = new ProcessManager(stateDirectory);
    let unrelatedListener: ReturnType<typeof createServer> | undefined;

    context.after(async () => {
      if (unrelatedListener) {
        await closeServer(unrelatedListener);
      }
      await manager.stopServer(project.id).catch(() => undefined);
      await rm(fixtureRoot, { recursive: true, force: true });
    });

    const started = await manager.startServer(project, { port: expectedPort });

    assert.equal(started.port, expectedPort);
    assert.notEqual(started.port, fixedPort);

    unrelatedListener = await listenOnPort(expectedPort);

    let running = await manager.getServerProcess(project.id);

    for (
      let attempt = 0;
      attempt < 100 && running?.status !== 'running';
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      running = await manager.getServerProcess(project.id);
    }

    assert.equal(running?.status, 'running');
    assert.equal(running?.port, fixedPort);
    assert.equal(running?.url, `http://localhost:${fixedPort}`);
    assert.deepEqual(running?.urls, [`http://localhost:${fixedPort}`]);
  },
);
