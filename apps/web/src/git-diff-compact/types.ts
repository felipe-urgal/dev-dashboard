export interface DiffSummaryMetric {
  label: string;
  value: string;
  tone?: 'addition' | 'deletion' | 'neutral';
}

export interface LeadingPatchMetadata {
  metadata: string[];
  content: string[];
}
