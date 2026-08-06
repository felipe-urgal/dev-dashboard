import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

import {
  installTestLogInspectorMutationGuard,
  isTestLogInspectorOwnedMutation,
} from '../src/test-log-inspector-mutation-guard';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

function elementInsideInspector(): Element {
  const element = {
    nodeType: 1,
    parentElement: null,
    closest(selector: string) {
      return selector.includes('.test-log-inspector') ? element : null;
    },
  };
  return element as unknown as Element;
}

function elementOutsideInspector(): Element {
  return {
    nodeType: 1,
    parentElement: null,
    closest() {
      return null;
    },
  } as unknown as Element;
}

function mutation(target: Node): MutationRecord {
  return { target } as MutationRecord;
}

class FakeMutationObserver implements MutationObserver {
  static instances: FakeMutationObserver[] = [];

  readonly callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(): void {}

  disconnect(): void {}

  takeRecords(): MutationRecord[] {
    return [];
  }

  emit(records: MutationRecord[]): void {
    this.callback(records, this);
  }
}

test('reconhece mutações produzidas pelo toolbar e pelo diagnóstico', () => {
  const inspector = elementInsideInspector();
  const textNode = {
    nodeType: 3,
    parentElement: inspector,
  } as unknown as Node;

  assert.equal(isTestLogInspectorOwnedMutation(mutation(inspector)), true);
  assert.equal(isTestLogInspectorOwnedMutation(mutation(textNode)), true);
  assert.equal(
    isTestLogInspectorOwnedMutation(mutation(elementOutsideInspector())),
    false,
  );
});

test('entrega somente mutações externas ao callback do inspetor', () => {
  const originalMutationObserver = globalThis.MutationObserver;
  FakeMutationObserver.instances = [];
  globalThis.MutationObserver =
    FakeMutationObserver as unknown as typeof MutationObserver;

  try {
    const restore = installTestLogInspectorMutationGuard();
    const GuardedMutationObserver = globalThis.MutationObserver;
    const delivered: MutationRecord[][] = [];
    new GuardedMutationObserver((records) => delivered.push(records));
    restore();

    const delegate = FakeMutationObserver.instances[0];
    assert.ok(delegate);

    const owned = mutation(elementInsideInspector());
    const external = mutation(elementOutsideInspector());
    delegate.emit([owned]);
    delegate.emit([owned, external]);

    assert.equal(delivered.length, 1);
    assert.deepEqual(delivered[0], [external]);
    assert.equal(globalThis.MutationObserver, FakeMutationObserver);
  } finally {
    globalThis.MutationObserver = originalMutationObserver;
  }
});

test('instala o guard somente durante a criação do observer do inspetor', async () => {
  const main = await readFile(sourceFile('main.ts'), 'utf8');

  assert.match(main, /installTestLogInspectorMutationGuard\(\)/);
  assert.match(main, /try\s*{\s*installTestLogInspector\(\);\s*}\s*finally/);
  assert.match(main, /restoreTestLogInspectorMutationObserver\(\)/);
});
