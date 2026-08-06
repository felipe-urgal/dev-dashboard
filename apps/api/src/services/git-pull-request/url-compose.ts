import { GitPullRequestError } from './errors.js';
import type { ParsedRemote } from './remote-parsing.js';

export function composeGithubUrl(options: {
  target: ParsedRemote;
  source: ParsedRemote;
  sourceBranch: string;
  baseBranch: string;
  title?: string;
  description?: string;
}): string {
  const sameRepository = options.target.ownerRepo === options.source.ownerRepo;
  const sourceOwner = options.source.ownerRepo.split('/')[0] ?? '';
  const head = sameRepository
    ? options.sourceBranch
    : `${sourceOwner}:${options.sourceBranch}`;
  const params = new URLSearchParams({ quick_pull: '1' });
  if (options.title?.trim()) params.set('title', options.title.trim());
  if (options.description?.trim())
    params.set('body', options.description.trim());
  return `https://${options.target.host}/${options.target.ownerRepo}/compare/${encodeURIComponent(options.baseBranch)}...${encodeURIComponent(head)}?${params.toString()}`;
}

export function composeGitlabUrl(options: {
  target: ParsedRemote;
  source: ParsedRemote;
  sourceBranch: string;
  baseBranch: string;
  title?: string;
  description?: string;
}): string {
  if (options.target.ownerRepo !== options.source.ownerRepo) {
    throw new GitPullRequestError(
      'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
      'Pull Request entre forks diferentes é suportada pelo painel somente no GitHub.',
    );
  }

  const params = new URLSearchParams({
    'merge_request[source_branch]': options.sourceBranch,
    'merge_request[target_branch]': options.baseBranch,
  });
  if (options.title?.trim())
    params.set('merge_request[title]', options.title.trim());
  if (options.description?.trim()) {
    params.set('merge_request[description]', options.description.trim());
  }
  return `https://${options.target.host}/${options.target.ownerRepo}/-/merge_requests/new?${params.toString()}`;
}
