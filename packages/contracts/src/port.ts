import type { ManagedProcessKind, ManagedProcessStatus } from './process.js';

export type LocalPortInspectionStatus = 'ready' | 'unsupported' | 'unavailable';

export type LocalPortState = 'available' | 'occupied';

export type LocalPortScope = 'loopback' | 'all-interfaces';

export interface LocalPortManagedProcess {
  id: string;
  projectId: string;
  projectName: string;
  kind: ManagedProcessKind;
  status: ManagedProcessStatus;
}

export interface LocalPortExternalProcess {
  pid: number;
  name: string;
}

export interface LocalPortExpectation {
  projectId: string;
  projectName: string;
  service: 'server';
}

export interface LocalPortEntry {
  port: number;
  address: string;
  scope: LocalPortScope;
  state: LocalPortState;
  conflict: boolean;
  expected: LocalPortExpectation[];
  managedProcess?: LocalPortManagedProcess;
  externalProcess?: LocalPortExternalProcess;
  suggestedPort?: number;
}

export interface LocalPortInspection {
  status: LocalPortInspectionStatus;
  platform: 'linux' | 'unsupported';
  inspectedAt: string;
  entries: LocalPortEntry[];
  truncated: boolean;
  warning?: string;
}

export type ReservedPortScope = 'work' | 'infrastructure' | 'user';

export interface ReservedPort {
  port: number;
  scope: ReservedPortScope;
  owner?: string;
  role?: string;
  description?: string;
}

export type DeclaredProjectPortSource =
  | 'config'
  | 'package-script'
  | 'compose'
  | 'project-profile'
  | 'manual';

export type DeclaredProjectPortConfidence = 'certain' | 'strong' | 'weak';

export interface DeclaredProjectPort {
  projectId: string;
  port: number;
  role: string;
  source: DeclaredProjectPortSource;
  confidence: DeclaredProjectPortConfidence;
  /** `false` permite representar uma declaration que perdeu sua capability de origem. */
  active?: boolean;
}

export type ObservedPortOwner =
  | { kind: 'project'; projectId: string; processId?: string }
  | { kind: 'external'; pid: number; name?: string }
  | { kind: 'unknown' };

export interface ObservedPort {
  port: number;
  owner: ObservedPortOwner;
  address?: string;
  protocol?: 'tcp' | 'udp';
}

export type PortReconciliationState =
  | 'available'
  | 'expected'
  | 'conflict'
  | 'reserved-by-other'
  | 'unexpected'
  | 'unknown-owner'
  | 'duplicate-declaration'
  | 'stale-declaration';

export interface PortReconciliationEntry {
  port: number;
  state: PortReconciliationState;
  reserved: ReservedPort[];
  declared: DeclaredProjectPort[];
  observed: ObservedPort[];
  explanation: string;
}

export interface PortReconciliation {
  entries: PortReconciliationEntry[];
}

export interface PortAllocationRequest {
  preferredPort: number;
  maxPort?: number;
  projectId?: string;
  role?: string;
}

export interface PortAllocationResult {
  port: number;
  explanation: string;
}
