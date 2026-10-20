/** A profile selects existing bindings for a project environment. It grants no runtime authority. */
export type ServiceRuntimeProfileKind = 'dev' | 'test' | 'production';

export interface ServiceRuntimeProfile {
  id: string;
  projectId: string;
  environmentInstanceId: string;
  kind: ServiceRuntimeProfileKind;
  /** IDs of existing ProjectServiceBinding records, never shell/paths/resources. */
  bindingIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRuntimeProfileDraft {
  environmentInstanceId: string;
  kind: ServiceRuntimeProfileKind;
  bindingIds: string[];
}

export interface ServiceRuntimeProfileView extends ServiceRuntimeProfile {
  /** Invalid after a binding was removed, disabled or moved; never silently substituted. */
  staleBindingIds: string[];
}
