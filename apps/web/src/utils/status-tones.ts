import type {
  ActivityStatus,
  DatabaseReachability,
  GitFileStatus,
  ManagedProcessStatus,
  ProjectScriptRisk,
} from '@dev-dashboard/contracts';

import type { StatusBadgeTone } from '../components/status-badge-types';

export function activityToneFor(status: ActivityStatus): StatusBadgeTone {
  switch (status) {
    case 'running': return 'info';
    case 'succeeded': return 'success';
    case 'failed': return 'danger';
    case 'cancelled': return 'warning';
    default: return 'neutral';
  }
}

export function processToneFor(status: ManagedProcessStatus): StatusBadgeTone {
  switch (status) {
    case 'starting':
    case 'stopping':
      return 'info';
    case 'running': return 'success';
    case 'stopped': return 'warning';
    case 'failed': return 'danger';
    default: return 'neutral';
  }
}

export function gitFileToneFor(status: GitFileStatus): StatusBadgeTone {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'success';
    case 'deleted':
    case 'conflicted':
      return 'danger';
    case 'renamed':
    case 'copied':
      return 'info';
    case 'modified':
    case 'type-changed':
    default:
      return 'neutral';
  }
}

export function riskToneFor(risk: ProjectScriptRisk): StatusBadgeTone {
  switch (risk) {
    case 'read-only': return 'success';
    case 'mutable': return 'warning';
    case 'destructive': return 'danger';
    default: return 'neutral';
  }
}

export function dbReachabilityToneFor(state: DatabaseReachability): StatusBadgeTone {
  switch (state) {
    case 'reachable': return 'success';
    case 'unreachable': return 'danger';
    default: return 'neutral';
  }
}
