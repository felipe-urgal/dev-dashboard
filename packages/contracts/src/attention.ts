export type AttentionCategory =
  'git' | 'process' | 'test' | 'production' | 'doctor';

export type AttentionSeverity = 'critical' | 'warning';

export type AttentionDestination =
  'processes' | 'git' | 'tests' | 'production' | 'doctor';

export interface AttentionAction {
  destination: AttentionDestination;
  projectId?: string;
}

export interface AttentionItem {
  id: string;
  projectId: string;
  projectName: string;
  category: AttentionCategory;
  severity: AttentionSeverity;
  message: string;
  observedAt: string;
  action: AttentionAction;
}

export interface AttentionUnavailableSource {
  category: AttentionCategory;
  projectId?: string;
}

export interface WorkspaceAttention {
  workspaceId: string;
  generatedAt: string;
  partial: boolean;
  unavailableSources: AttentionUnavailableSource[];
  items: AttentionItem[];
}
