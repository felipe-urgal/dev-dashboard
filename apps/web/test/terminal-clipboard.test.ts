import assert from 'node:assert/strict';
import { test } from 'vitest';

import { isTerminalCopyShortcut } from '../src/utils/terminal-clipboard';

function keyEvent(
  overrides: Partial<{
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }> = {},
) {
  return {
    key: 'c',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  };
}

test('copia com Ctrl+C quando existe seleção fora do macOS', () => {
  assert.equal(
    isTerminalCopyShortcut(
      keyEvent({ ctrlKey: true }),
      true,
      false,
    ),
    true,
  );
});

test('mantém Ctrl+C como SIGINT quando não existe seleção', () => {
  assert.equal(
    isTerminalCopyShortcut(
      keyEvent({ ctrlKey: true }),
      false,
      false,
    ),
    false,
  );
});

test('aceita Ctrl+Shift+C porque o Shift não muda o atalho de cópia', () => {
  assert.equal(
    isTerminalCopyShortcut(
      {
        ...keyEvent({ ctrlKey: true }),
        shiftKey: true,
      },
      true,
      false,
    ),
    true,
  );
});

test('usa Command+C no macOS sem capturar Ctrl+C', () => {
  assert.equal(
    isTerminalCopyShortcut(
      keyEvent({ metaKey: true }),
      true,
      true,
    ),
    true,
  );
  assert.equal(
    isTerminalCopyShortcut(
      keyEvent({ ctrlKey: true }),
      true,
      true,
    ),
    false,
  );
});

test('não captura outros atalhos ou combinações com Alt', () => {
  assert.equal(
    isTerminalCopyShortcut(
      keyEvent({ key: 'v', ctrlKey: true }),
      true,
      false,
    ),
    false,
  );
  assert.equal(
    isTerminalCopyShortcut(
      keyEvent({ ctrlKey: true, altKey: true }),
      true,
      false,
    ),
    false,
  );
});
