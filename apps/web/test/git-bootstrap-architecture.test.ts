import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizWeb = resolve(import.meta.dirname, '..');
const entrada = readFileSync(resolve(raizWeb, 'src/main.ts'), 'utf8');

describe('arquitetura do bootstrap Git', () => {
  it('não reinstala o feedback Git baseado em interceptação global', () => {
    expect(entrada).not.toContain('git-action-feedback');
    expect(entrada).not.toContain('installGitActionFeedback');
    expect(existsSync(resolve(raizWeb, 'src/git-action-feedback.ts'))).toBe(
      false,
    );
    expect(existsSync(resolve(raizWeb, 'src/git-action-feedback.css'))).toBe(
      false,
    );
  });
});
