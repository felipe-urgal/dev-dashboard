import type { GitFileStatus } from './git.js';

export type GitStashOperation = 'create' | 'apply' | 'pop' | 'drop';

export interface GitStashSummary {
  index: number;
  reference: string;
  hash: string;
  message: string;
  branch: string;
  createdAt: string;
  fileCount: number;
  additions: number;
  deletions: number;
  includesUntracked: boolean;
}

export interface GitStashFile {
  path: string;
  previousPath?: string | undefined;
  status: GitFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitStashDetail extends GitStashSummary {
  files: GitStashFile[];
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface GitStashConfirmation {
  token: string;
  operation: GitStashOperation;
  target: string;
  expiresAt: string;
}

export interface GitStashCreateInput {
  message: string;
  includeUntracked: boolean;
  keepIndex: boolean;
}

export interface GitStashMutationResult {
  stash: GitStashSummary;
  applied: boolean;
  removed: boolean;
}
