import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Stack } from '@dev-dashboard/contracts';

import { StackStore } from '../src/store/stack-store.js';

function stack(id = 'local-stack', name = 'Local stack'): Stack {
  return {
    id,
    name,
    nodes: [
      {
        id: 'postgres',
        name: 'Postgres',
        target: {
          kind: 'compose-service',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          service: 'postgres',
        },
      },
      {
        id: 'api',
        name: 'API',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
    ],
    dependencies: [{ nodeId: 'api', dependsOnNodeId: 'postgres' }],
  };
}

function temporaryDirectory(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'dev-dashboard-stack-store-'));
}

test('persists stacks and reloads them after restart', () => {
  const stateDirectory = temporaryDirectory();
  try {
    const first = new StackStore({ stateDirectory });
    first.save(stack());

    const second = new StackStore({ stateDirectory });

    assert.deepEqual(second.findById('local-stack'), stack());
    assert.deepEqual(second.list(), [stack()]);
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test('returns detached copies so callers cannot mutate persisted definitions', () => {
  const store = new StackStore();
  const saved = store.save(stack());

  saved.nodes[0]!.name = 'Mutated';
  const found = store.findById('local-stack');
  found!.nodes[0]!.name = 'Mutated again';

  assert.equal(store.findById('local-stack')?.nodes[0]?.name, 'Postgres');
});

test('rejects invalid or cyclic topology before persistence', () => {
  const store = new StackStore();
  const invalid = stack();
  invalid.dependencies.push({
    nodeId: 'postgres',
    dependsOnNodeId: 'api',
  });

  assert.throws(() => store.save(invalid), /cycle/i);
  assert.equal(store.findById('local-stack'), null);
});

test('updates existing stack by id and keeps deterministic listing', () => {
  const store = new StackStore();

  store.save(stack('z-stack', 'Zulu'));
  store.save(stack('a-stack', 'Alpha'));
  store.save(stack('z-stack', 'Beta'));

  assert.deepEqual(
    store.list().map((item) => [item.id, item.name]),
    [
      ['a-stack', 'Alpha'],
      ['z-stack', 'Beta'],
    ],
  );
});

test('delete persists removal and reports whether the stack existed', () => {
  const stateDirectory = temporaryDirectory();
  try {
    const store = new StackStore({ stateDirectory });
    store.save(stack());

    assert.equal(store.delete('local-stack'), true);
    assert.equal(store.delete('local-stack'), false);
    assert.equal(new StackStore({ stateDirectory }).findById('local-stack'), null);
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test('ignores malformed persisted entries without losing valid stacks', () => {
  const stateDirectory = temporaryDirectory();
  try {
    writeFileSync(
      path.join(stateDirectory, 'stacks.json'),
      JSON.stringify({
        version: 1,
        stacks: [
          stack('valid-stack', 'Valid'),
          {
            id: 'invalid-stack',
            name: 'Invalid',
            nodes: [],
            dependencies: [],
          },
        ],
      }),
      'utf8',
    );

    const store = new StackStore({ stateDirectory });

    assert.deepEqual(
      store.list().map((item) => item.id),
      ['valid-stack'],
    );
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test('writes versioned state with restrictive file permissions', () => {
  const stateDirectory = temporaryDirectory();
  try {
    const store = new StackStore({ stateDirectory });
    store.save(stack());

    const stateFile = path.join(stateDirectory, 'stacks.json');
    const persisted = JSON.parse(readFileSync(stateFile, 'utf8')) as {
      version: number;
      stacks: Stack[];
    };

    assert.equal(persisted.version, 1);
    assert.deepEqual(persisted.stacks, [stack()]);
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});
