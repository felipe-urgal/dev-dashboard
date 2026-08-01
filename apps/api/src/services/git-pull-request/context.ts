import type { GitPullRequestProvider } from '@dev-dashboard/contracts';

import type { ParsedRemote } from './remote-parsing.js';

export type GitPullRequestTargetRemote = 'origin' | 'upstream';

export interface ResolvedPullRequestContext {
  projectPath: string;
  branch: string;
  targetRemote: GitPullRequestTargetRemote;
  baseBranch: string;
  sourceBranch: string;
  source: ParsedRemote;
  target: ParsedRemote;
  provider: GitPullRequestProvider;
}
