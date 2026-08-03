import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  storeSidebarCollapsed,
} from '../src/utils/sidebar-preferences';

test('lê somente o valor explícito true para recolher a navegação', () => {
  assert.equal(readSidebarCollapsed({ getItem: () => null }), false);
  assert.equal(readSidebarCollapsed({ getItem: () => 'false' }), false);
  assert.equal(readSidebarCollapsed({ getItem: () => 'true' }), true);
});

test('persiste a preferência do menu lateral', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  storeSidebarCollapsed(true, storage);
  assert.equal(values.get(SIDEBAR_COLLAPSED_STORAGE_KEY), 'true');
  assert.equal(readSidebarCollapsed(storage), true);

  storeSidebarCollapsed(false, storage);
  assert.equal(values.get(SIDEBAR_COLLAPSED_STORAGE_KEY), 'false');
  assert.equal(readSidebarCollapsed(storage), false);
});

test('ignora falhas do armazenamento local', () => {
  assert.equal(readSidebarCollapsed({
    getItem: () => {
      throw new Error('indisponível');
    },
  }), false);

  assert.doesNotThrow(() => storeSidebarCollapsed(true, {
    setItem: () => {
      throw new Error('indisponível');
    },
  }));
});
