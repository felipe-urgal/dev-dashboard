import assert from 'node:assert/strict';

import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProcessManager } from '../src/index.js';

interface Fixture {
  root: string;
  project: Project;
  manager: ProcessManager;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-log-clear-'),
  );

  const projectPath = path.join(root, 'project');

  await mkdir(projectPath, { recursive: true });

  return {
    root,
    project: {
      id: 'log-clear-project',
      name: 'Log clear fixture',
      path: projectPath,
      type: 'node',
      source: 'workspace',
      favorite: false,
      capabilities: ['server'],
    },
    manager: new ProcessManager(path.join(root, 'state')),
  };
}

async function waitForLog(
  manager: ProcessManager,
  projectId: string,
  pattern: RegExp,
): Promise<string> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = await manager.readServerLog(projectId);

    if (pattern.test(snapshot.content)) {
      return snapshot.content;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`O log esperado ${pattern} não foi encontrado.`);
}

test(
  'clears the persisted log and only shows subsequent output',
  async (context) => {
    const fixture = await createFixture();

    context.after(async () => {
      await fixture.manager
        .stopServer(fixture.project.id)
        .catch(() => undefined);

      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await Promise.all([
      writeFile(
        path.join(fixture.project.path, 'server.js'),
        [
          "console.log('before-clear');",
          "setTimeout(() => console.log('after-clear'), 2000);",
          'setInterval(() => {}, 60000);',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(fixture.project.path, 'package.json'),
        JSON.stringify({
          name: 'log-clear-fixture',
          scripts: {
            dev: 'node server.js',
          },
        }),
      ),
    ]);

    await fixture.manager.startServer(fixture.project);

    await waitForLog(
      fixture.manager,
      fixture.project.id,
      /before-clear/,
    );

    const cleared = await fixture.manager.clearServerLog(
      fixture.project.id,
    );

    assert.equal(cleared.content, '');
    assert.equal(cleared.sizeBytes, 0);

    const immediatelyAfterClear =
      await fixture.manager.readServerLog(
        fixture.project.id,
      );

    assert.equal(immediatelyAfterClear.content, '');

    const newContent = await waitForLog(
      fixture.manager,
      fixture.project.id,
      /after-clear/,
    );

    assert.equal(newContent.includes('before-clear'), false);
  },
);

test(
  'disables the pnpm modules purge prompt for detached servers',
  async (context) => {
    const fixture = await createFixture();
    const binDirectory = path.join(fixture.root, 'bin');
    const previousPath = process.env.PATH;

    context.after(async () => {
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }

      await fixture.manager
        .stopServer(fixture.project.id)
        .catch(() => undefined);

      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await mkdir(binDirectory, { recursive: true });

    const fakePnpm = path.join(binDirectory, 'pnpm');

    await writeFile(
      fakePnpm,
      [
        '#!/usr/bin/env node',
        "console.log('ci=' + process.env.CI);",
        "console.log('confirm=' + process.env.pnpm_config_confirmModulesPurge);",
        'setInterval(() => {}, 60000);',
        '',
      ].join('\n'),
    );

    await chmod(fakePnpm, 0o755);

    await Promise.all([
      writeFile(
        path.join(fixture.project.path, 'pnpm-lock.yaml'),
        'lockfileVersion: 9\n',
      ),
      writeFile(
        path.join(fixture.project.path, 'package.json'),
        JSON.stringify({
          name: 'pnpm-fixture',
          scripts: {
            dev: 'node server.js',
          },
        }),
      ),
    ]);

    process.env.PATH = [
      binDirectory,
      previousPath ?? '',
    ].filter(Boolean).join(path.delimiter);

    await fixture.manager.startServer(fixture.project);

    const content = await waitForLog(
      fixture.manager,
      fixture.project.id,
      /ci=true[\s\S]*confirm=false/,
    );

    assert.match(content, /ci=true/);
    assert.match(content, /confirm=false/);
  },
);


test(
  'forwards Next.js options without a double-dash when using pnpm',
  async (context) => {
    const fixture = await createFixture();
    const binDirectory = path.join(fixture.root, 'bin');
    const previousPath = process.env.PATH;

    context.after(async () => {
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }

      await fixture.manager
        .stopServer(fixture.project.id)
        .catch(() => undefined);

      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await mkdir(binDirectory, { recursive: true });

    const fakePnpm = path.join(binDirectory, 'pnpm');

    await writeFile(
      fakePnpm,
      [
        '#!/usr/bin/env node',
        "console.log('args=' + JSON.stringify(process.argv.slice(2)));",
        'setInterval(() => {}, 60000);',
        '',
      ].join('\n'),
    );

    await chmod(fakePnpm, 0o755);

    await Promise.all([
      writeFile(
        path.join(fixture.project.path, 'pnpm-lock.yaml'),
        'lockfileVersion: 9\n',
      ),
      writeFile(
        path.join(fixture.project.path, 'package.json'),
        JSON.stringify({
          name: 'next-pnpm-fixture',
          scripts: {
            dev: 'next dev -H 0.0.0.0',
          },
        }),
      ),
    ]);

    process.env.PATH = [
      binDirectory,
      previousPath ?? '',
    ].filter(Boolean).join(path.delimiter);

    await fixture.manager.startServer(fixture.project, {
      port: 3210,
    });

    const content = await waitForLog(
      fixture.manager,
      fixture.project.id,
      /args=/,
    );

    assert.match(
      content,
      /args=\["run","dev","--hostname","0\.0\.0\.0","--port","3210"\]/,
    );
    assert.equal(content.includes('"--"'), false);
  },
);
