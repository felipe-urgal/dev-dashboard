/**
 * Ações mutáveis do `gh` expostas pelo dashboard, restritas ao catálogo
 * fechado registrado em `git-mutation-catalog.ts`
 * (`pull-request-create`/`pull-request-edit`/`pull-request-close`/`pull-request-merge`).
 * Nenhum subcomando arbitrário do `gh` é aceito — ver
 * `docs/architecture/security.md`, "Integração com o GitHub CLI (gh)".
 */
export type GitPullRequestMutationActionId =
  | 'pull-request-create'
  | 'pull-request-edit'
  | 'pull-request-close'
  | 'pull-request-merge';

export type GitPullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

export interface GitPullRequestMutationConfirmation {
  token: string;
  actionId: GitPullRequestMutationActionId;
  expiresAt: string;
}

export type GitPullRequestMutationState = 'open' | 'closed' | 'merged';

export interface GitPullRequestMutationResult {
  action: GitPullRequestMutationActionId;
  number: number;
  url: string;
  title: string;
  state: GitPullRequestMutationState;
}
