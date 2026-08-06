import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

import type * as Monaco from 'monaco-editor';

import { registerEmbeddedEditorCustomLanguages } from '../src/monaco-languages';

function fakeMonaco(existingLanguages: Array<{ id: string }> = []) {
  const languages: Array<{ id: string }> = [...existingLanguages];
  return {
    instance: {
      languages: {
        getLanguages: vi.fn(() => languages),
        register: vi.fn((language: { id: string }) => languages.push(language)),
        setMonarchTokensProvider: vi.fn(),
      },
    } as unknown as typeof Monaco,
  };
}

test('registra a linguagem haml com um tokenizer Monarch', () => {
  const monaco = fakeMonaco();
  registerEmbeddedEditorCustomLanguages(monaco.instance);

  assert.deepEqual(
    (monaco.instance.languages.register as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0],
    { id: 'haml' },
  );
  const [languageId, tokenizer] = (
    monaco.instance.languages.setMonarchTokensProvider as ReturnType<
      typeof vi.fn
    >
  ).mock.calls[0] as [string, Monaco.languages.IMonarchLanguage];
  assert.equal(languageId, 'haml');
  assert.ok(Array.isArray(tokenizer.tokenizer.root));
  assert.ok(tokenizer.tokenizer.root.length > 5);
  assert.ok(Array.isArray(tokenizer.tokenizer.interpolation));
});

test('não registra a linguagem haml duas vezes', () => {
  const monaco = fakeMonaco([{ id: 'haml' }]);
  registerEmbeddedEditorCustomLanguages(monaco.instance);

  assert.equal(
    (monaco.instance.languages.register as ReturnType<typeof vi.fn>).mock.calls
      .length,
    0,
  );
  assert.equal(
    (
      monaco.instance.languages.setMonarchTokensProvider as ReturnType<
        typeof vi.fn
      >
    ).mock.calls.length,
    0,
  );
});
