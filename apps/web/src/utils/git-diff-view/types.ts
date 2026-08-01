export type GitDiffLineKind =
  | 'addition'
  | 'deletion'
  | 'context'
  | 'hunk'
  | 'meta'
  | 'notice';

export interface GitDiffLineSyntaxRange {
  start: number;
  end: number;
  className: string;
}

export interface GitDiffWordRange {
  start: number;
  end: number;
}

export interface GitUnifiedDiffLine {
  kind: GitDiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
  /** Trechos alterados dentro da linha, quando ela forma par com a linha oposta. */
  words?: readonly GitDiffWordRange[];
  /** Faixas de realce de sintaxe, quando a linguagem do arquivo é conhecida. */
  syntax?: readonly GitDiffLineSyntaxRange[];
}

export interface GitSplitDiffRow {
  kind: 'change' | 'context' | 'meta';
  left: GitUnifiedDiffLine | null;
  right: GitUnifiedDiffLine | null;
}

export interface GitDiffLineRenderOptions {
  words?: readonly GitDiffWordRange[];
  syntax?: readonly GitDiffLineSyntaxRange[];
  query?: string;
}

export interface GitDiffHunk {
  header: GitUnifiedDiffLine;
  lines: GitUnifiedDiffLine[];
  /** Diferença entre a numeração nova e a antiga na região deste hunk. */
  lineOffset: number;
  firstNewLine: number | null;
  lastNewLine: number | null;
}

export interface GitDiffHunkSplit {
  /** Linhas de metadados que aparecem antes do primeiro hunk. */
  leading: GitUnifiedDiffLine[];
  hunks: GitDiffHunk[];
}
