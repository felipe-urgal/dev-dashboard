export type {
  GitDiffHunk,
  GitDiffHunkSplit,
  GitDiffLineKind,
  GitDiffLineRenderOptions,
  GitDiffLineSyntaxRange,
  GitDiffWordRange,
  GitSplitDiffRow,
  GitUnifiedDiffLine,
} from './git-diff-view/types';

export { parseUnifiedGitDiff } from './git-diff-view/parse';
export { buildSplitGitDiffRows } from './git-diff-view/split-rows';
export { annotateGitDiffWordChanges, computeGitDiffWordRanges } from './git-diff-view/word-diff';
export { countGitDiffMatches, highlightGitDiffText, renderGitDiffLineHtml } from './git-diff-view/html-render';
export { buildGitDiffContextLines, splitGitDiffHunks } from './git-diff-view/hunks';
