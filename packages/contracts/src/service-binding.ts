/** A binding documents usage. It is never a lifecycle authorization. */
export type ProjectServiceRelation = 'owned' | 'required' | 'observed';

export interface ProjectServiceDependency {
  serviceRef: string;
  source: 'manual' | 'compose';
  observedAt?: string;
}

export interface ProjectServiceBinding {
  id: string;
  projectId: string;
  environmentInstanceId: string;
  /** Exact identity from ServiceCatalogSnapshot.entries[].id. */
  serviceRef: string;
  /** Optional descriptive role (e.g. database, cache, api); not authority. */
  role?: string;
  relation: ProjectServiceRelation;
  requiredForStart: boolean;
  enabled: boolean;
  dependencies: ProjectServiceDependency[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectServiceBindingDraft = Pick<
  ProjectServiceBinding,
  'serviceRef' | 'role' | 'relation' | 'requiredForStart' | 'enabled' | 'dependencies'
> & { environmentInstanceId?: string };

export interface ProjectServiceBindingView extends ProjectServiceBinding {
  availability: 'observed' | 'stale' | 'orphaned';
  /** Identical serviceRef is a shared dependency if consumers differ. */
  shared: boolean;
  consumerCount: number;
}

export interface ProjectServiceBindingSuggestion {
  serviceRef: string;
  dependsOnServiceRef: string;
  source: 'compose';
  observedAt: string;
}

export interface ProjectServiceBindingPreview {
  projectId: string;
  environmentInstanceId: string;
  candidates: Array<{
    serviceRef: string;
    name: string;
    provider: string;
    ownership: string;
    linkableAsOwned: boolean;
  }>;
  suggestions: ProjectServiceBindingSuggestion[];
  partial: boolean;
  diagnostic?: string;
}
