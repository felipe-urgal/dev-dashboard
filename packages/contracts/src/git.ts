export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'type-changed';
export interface GitFileChange { path: string; previousPath?: string; indexStatus: string; worktreeStatus: string; status: GitFileStatus; }
export interface GitCommit { hash: string; shortHash: string; subject: string; authorName: string; authorEmail: string; authoredAt: string; }
export interface ProjectGitOverview { repository: boolean; branch?: string; detached: boolean; upstream?: string; ahead: number; behind: number; clean: boolean; files: GitFileChange[]; latestCommit?: GitCommit; recentCommits: GitCommit[]; }
