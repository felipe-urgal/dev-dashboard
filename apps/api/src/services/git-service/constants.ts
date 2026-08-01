export const GIT_DIFF_FILE_LIMIT = 262_144;
export const GIT_DIFF_LINES_LIMIT = 400;
export const GIT_MUTATION_CONFIRMATION_TTL_MS = 60_000;
export const GIT_BRANCH_NAME_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;

export const LOG_SEPARATOR = '\u001f';
export const RECORD_SEPARATOR = '\u001e';

export const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export const COMMIT_MESSAGE_MAX_LENGTH = 500;

export const REMOTE_UNAVAILABLE_PATTERN = /could not resolve host|connection (refused|timed out)|could not read from remote repository|permission denied|authentication failed|could not read username|no route to host/i;

// Espelha _git_branch_prefix do CLI bash (lib/git/helpers.sh): o tipo é o trecho do branch antes da primeira "/".
export const SAVE_PREFIX_BY_BRANCH_TYPE: Readonly<Record<string, string>> = {
  feature: 'feat',
  fix: 'fix',
  refactor: 'refactor',
  chore: 'chore',
  docs: 'docs',
  hotfix: 'fix',
};
