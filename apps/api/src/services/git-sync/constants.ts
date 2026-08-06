import type { GitSyncStrategy } from '@dev-dashboard/contracts';

export const CONFIRMATION_TTL_MS = 60_000;
export const MAIN_BRANCH = 'main';
export const MAIN_REFERENCE = 'upstream/main';
export const MAIN_STRATEGY: GitSyncStrategy = 'merge';
export const REMOTE_REFERENCE_PATTERN =
  /^[A-Za-z0-9._-]+\/(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;
export const CONFLICT_PATTERN =
  /conflict|could not apply|automatic merge failed|resolve all conflicts/i;
export const FAST_FORWARD_PATTERN =
  /not possible to fast-forward|diverging branches|fatal: not possible/i;
