import type { GitPullRequestCiStatus } from './git.js';

export type GitPullRequestRemoteStatus =
  | 'available'
  | 'unauthenticated'
  | 'rate-limited'
  | 'unavailable';

export type GitPullRequestReviewState =
  | 'approved'
  | 'changes-requested'
  | 'review-required'
  | 'unknown';

export interface GitPullRequestCheck {
  name: string;
  status: GitPullRequestCiStatus;
  detailsUrl?: string;
}

export interface GitPullRequestCockpit {
  remoteStatus: GitPullRequestRemoteStatus;
  headSha?: string;
  draft?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string;
  reviewState: GitPullRequestReviewState;
  requestedReviewers: string[];
  checks: GitPullRequestCheck[];
}
