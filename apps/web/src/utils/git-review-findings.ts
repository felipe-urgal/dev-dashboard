import type { GitPullRequestReviewFinding } from '@dev-dashboard/contracts';

/**
 * Chave estável usada para rastrear seleção/resolução/ignorados de um
 * apontamento entre o carregamento do review e a exibição inline no diff.
 */
export function findingKey(finding: GitPullRequestReviewFinding): string {
  return `${finding.path}:${finding.line ?? 0}:${finding.title}`;
}

export function findingSeverityLabel(
  finding: GitPullRequestReviewFinding,
): string {
  return {
    critical: 'Crítico',
    warning: 'Atenção',
    suggestion: 'Sugestão',
  }[finding.severity];
}
