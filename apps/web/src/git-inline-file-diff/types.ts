export type DiffViewMode = 'unified' | 'split';

export interface DetailConfiguration {
  container: string;
  files: string;
  patch: string;
  fullDiffSummary?: string;
  showFullDiff?: boolean;
}
