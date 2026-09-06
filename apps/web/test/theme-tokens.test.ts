import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(
  fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

describe('tokens de tema', () => {
  it('mantém aliases legados ligados aos tokens canônicos', () => {
    expect(tokens).toContain('--surface-color: var(--surface-1);');
    expect(tokens).toContain('--surface-muted: var(--surface-2);');
    expect(tokens).toContain('--border-color: var(--border);');
    expect(tokens).toContain('--text-color: var(--text);');
    expect(tokens).toContain('--text-secondary: var(--text-muted);');
  });
});
