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

  it('não reinstala limpeza de cabeçalhos Git baseada em MutationObserver', () => {
    expect(entrada).not.toContain('git-diff-header-cleanup');
    expect(entrada).not.toContain('installGitDiffHeaderCleanup');
    expect(existsSync(resolve(raizWeb, 'src/git-diff-header-cleanup.ts'))).toBe(
      false,
    );
  });

  it('não reescreve globalmente as requisições de histórico Git', () => {
    expect(entrada).not.toContain('git-summary-current-branch-history');
    expect(entrada).not.toContain('installGitSummaryCurrentBranchHistory');
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-current-branch-history.ts')),
    ).toBe(false);
  });

  it('não reinstala o resumo Git legado baseado em DOM', () => {
    expect(entrada).not.toContain('git-summary-history-enhancer');
    expect(entrada).not.toContain('installGitSummaryHistoryEnhancer');
    expect(entrada).not.toContain('git-summary-global-search-fix');
    expect(entrada).not.toContain('installGitSummaryGlobalSearchFix');
    expect(entrada).not.toContain('git-summary-inline-diff-fix');
    expect(entrada).not.toContain('installGitSummaryInlineDiffFix');
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-history-enhancer.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-history-enhancer.css')),
    ).toBe(false);
    expect(existsSync(resolve(raizWeb, 'src/git-summary-history'))).toBe(false);
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-global-search-fix.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-global-search-fix')),
    ).toBe(false);
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-inline-diff-fix.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(raizWeb, 'src/git-summary-inline-diff-fix')),
    ).toBe(false);
  });
});
