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
  | 'bundler';

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
}
