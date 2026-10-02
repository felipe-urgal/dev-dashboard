import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  findRelatedTestFiles,
  RelatedTestService,
} from '../src/services/related-test-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

test('maps Rails source files to RSpec files and keeps changed specs', () => {
  const related = findRelatedTestFiles(
    [
      'app/models/order.rb',
      'app/services/payment_processor.rb',
      'spec/requests/checkout_spec.rb',
    ],
    [
      'spec/models/order_spec.rb',
      'spec/services/payment_processor_spec.rb',
      'spec/requests/checkout_spec.rb',
      'spec/models/unrelated_spec.rb',
    ],
    'rspec',
  );

  assert.deepEqual(related, [
    'spec/models/order_spec.rb',
    'spec/requests/checkout_spec.rb',
    'spec/services/payment_processor_spec.rb',
  ]);
});

test('maps Node source files to colocated test and spec files', () => {
  const related = findRelatedTestFiles(
    ['src/services/auth.ts', 'src/components/button.tsx'],
    [
      'src/services/auth.test.ts',
      'src/services/session.test.ts',
      'src/components/button.spec.tsx',
    ],
    'vitest',
  );

  assert.deepEqual(related, [
    'src/components/button.spec.tsx',
    'src/services/auth.test.ts',
  ]);
});

test('does not include unrelated tests when no path or stem matches', () => {
  const related = findRelatedTestFiles(
    ['app/models/order.rb'],
    ['spec/models/customer_spec.rb'],
    'rspec',
  );

  assert.deepEqual(related, []);
});


test('prioriza a default branch declarada por origin/HEAD mesmo quando main existe localmente', async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-related-default-'),
  );
  context.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  await git(directory, ['init', '-q', '-b', 'develop']);
  await git(directory, ['config', 'user.name', 'Dev Dashboard Tests']);
  await git(directory, ['config', 'user.email', 'tests@example.com']);
  await writeFile(path.join(directory, 'app.ts'), 'export const value = 1;\n');
  await writeFile(
    path.join(directory, 'app.test.ts'),
    'export const tested = true;\n',
  );
  await git(directory, ['add', '-A']);
  await git(directory, ['commit', '-q', '-m', 'initial develop']);
  await git(directory, ['branch', 'main']);
  await git(directory, ['update-ref', 'refs/remotes/origin/develop', 'HEAD']);
  await git(directory, [
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/develop',
  ]);
  await git(directory, ['switch', '-q', '-c', 'feature/change']);
  await writeFile(path.join(directory, 'app.ts'), 'export const value = 2;\n');

  const detection = {
    getOverview: async () => ({
      supported: true,
      commands: [
        {
          id: 'test',
          runner: 'vitest',
          label: 'npm test',
          description: 'Vitest',
          origin: 'package-script',
          priority: 1,
          supportsFileTarget: true,
          supportsCaseTarget: true,
          supportsNamePatternTarget: true,
        },
      ],
    }),
    resolveCommand: async () => ({ command: 'npm', args: ['test'] }),
    listTestFiles: async () => [{ path: 'app.test.ts' }],
  } as never;
  const project: Project = {
    id: 'project-1',
    name: 'Project',
    path: directory,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['tests'],
  };

  const related = await new RelatedTestService(detection).resolve(
    project,
    'test',
  );

  assert.equal(related.baseBranch, 'develop');
  assert.equal(related.currentBranch, 'feature/change');
  assert.deepEqual(related.changedFiles, ['app.ts']);
  assert.deepEqual(related.testFiles, ['app.test.ts']);
});
