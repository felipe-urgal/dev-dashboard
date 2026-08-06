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
