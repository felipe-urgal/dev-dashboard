import type {
  ProductionContractV1,
  ProductionContractWarning,
} from './production.js';
import type { ProjectProfile } from './project-profile.js';

export type ProjectType = 'rails' | 'node' | 'unknown';

export type ProjectSource = 'workspace' | 'standalone';

export type ProjectCapability =
  | 'server'
  | 'git'
  | 'tests'
  | 'database'
  | 'scripts'
  | 'webpack'
  | 'sidekiq'
  | 'rake'
  | 'bundler'
  | 'production';

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  source: ProjectSource;
  workspaceId?: string;
  port?: number;
  enabled: boolean;
  lastAccessedAt?: string;
  capabilities: ProjectCapability[];
  profile?: ProjectProfile;
  production?: ProductionContractV1;
  productionWarning?: ProductionContractWarning;
}
