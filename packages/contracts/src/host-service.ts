/** Host-wide observations are informational, never proof of project ownership. */
export type HostServiceScope = 'system' | 'user';

export type HostServiceState =
  | 'running'
  | 'starting'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'unknown';

export type HostServiceBootState =
  | 'enabled'
  | 'disabled'
  | 'static'
  | 'masked'
  | 'indirect'
  | 'linked'
  | 'generated'
  | 'transient'
  | 'unknown';

export interface HostServiceObservation {
  id: string;
  provider: 'systemd';
  scope: HostServiceScope;
  name: string;
  state: HostServiceState;
  /** An active systemd unit is not evidence of application readiness. */
  readiness: 'unknown';
  bootState: HostServiceBootState;
  /** Discovery never grants lifecycle ownership. */
  managed: false;
  observedAt: string;
  diagnostic?: string;
}

export interface HostServiceInventorySource {
  scope: HostServiceScope;
  status: 'ready' | 'partial' | 'unavailable' | 'unsupported';
  diagnostic?: string;
}

export interface HostServiceInventory {
  status: 'ready' | 'partial' | 'unavailable' | 'unsupported';
  observedAt: string;
  services: HostServiceObservation[];
  sources: HostServiceInventorySource[];
  truncated: boolean;
}
