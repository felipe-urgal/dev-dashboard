import type { BundlerOverview } from '@dev-dashboard/contracts';

import { requestJson } from './core';

export type DependencyPackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'unknown';
export type DependencyUpdateKind =
  | 'none'
  | 'patch'
  | 'minor'
  | 'major'
  | 'unknown';

export interface ProjectDependencyInventoryEntry {
  name: string;
  kind: 'dependency' | 'devDependency';
  declaredRange: string;
  resolution: 'resolved' | 'unknown';
  resolvedVersion?: string;
}

export interface ProjectDependencyMetadata {
  name: string;
  state: 'available' | 'unavailable' | 'invalid';
  source: 'npm-registry';
  observedAt: string;
  latestVersion?: string;
  latestNodeEngine?: string;
  runtimeVersion?: string;
  latestRuntimeCompatibility: 'compatible' | 'incompatible' | 'unknown';
  update: DependencyUpdateKind;
  diagnostic?: string;
}

export interface ProjectDependencyAdvisory {
  name: string;
  state:
    | 'available'
    | 'partial'
    | 'unknown-version'
    | 'unavailable'
    | 'invalid';
  source: 'osv';
  observedAt: string;
  resolvedVersion?: string;
  advisories: Array<{ id: string; modified: string }>;
  complete: boolean;
  diagnostic?: string;
}

export interface ProjectDependencyHealth {
  generatedAt: string;
  inventory: {
    status: 'ready' | 'unavailable' | 'invalid';
    projectId: string;
    packageManager: DependencyPackageManager;
    observedAt: string;
    lockfile: 'present' | 'missing' | 'unsupported' | 'invalid';
    lockfileName?: string;
    lockfileVersion?: number;
    dependencies: ProjectDependencyInventoryEntry[];
    warnings: string[];
  };
  runtime: {
    state: 'declared' | 'missing' | 'invalid' | 'conflict';
    observedAt: string;
    declarations: Array<{
      source:
        | '.node-version'
        | '.nvmrc'
        | '.tool-versions#node'
        | '.tool-versions#nodejs';
      raw: string;
      version?: string;
    }>;
    version?: string;
    diagnostic?: string;
  };
  metadata: ProjectDependencyMetadata[];
  advisories: ProjectDependencyAdvisory[];
}

export type DependencyUpgradeAffectedFile =
  | 'package.json'
  | 'package-lock.json'
  | 'npm-shrinkwrap.json'
  | 'pnpm-lock.yaml'
  | 'yarn.lock'
  | 'bun.lock'
  | 'bun.lockb';

export interface ProjectDependencyUpgradePlan {
  generatedAt: string;
  projectId: string;
  packageManager: DependencyPackageManager;
  status: 'ready' | 'partial' | 'unavailable';
  items: Array<{
    name: string;
    kind: 'dependency' | 'devDependency';
    declaredRange: string;
    state: 'upgrade' | 'current' | 'unknown';
    update: DependencyUpdateKind;
    currentVersion?: string;
    targetVersion?: string;
    affectedFiles: DependencyUpgradeAffectedFile[];
    warnings: string[];
    gates: string[];
  }>;
  groups: Array<{
    id: string;
    basis: 'shared-manifest';
    dependencies: string[];
    affectedFiles: DependencyUpgradeAffectedFile[];
    lockstep: 'unknown';
  }>;
  warnings: string[];
}

function environmentQuery(
  environmentInstanceId?: string,
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams(extra);
  if (environmentInstanceId) {
    query.set('environmentInstanceId', environmentInstanceId);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export async function fetchProjectDependencyHealth(
  projectId: string,
  environmentInstanceId?: string,
  refresh = false,
): Promise<ProjectDependencyHealth> {
  const response = await requestJson<{ health: ProjectDependencyHealth }>(
    `/api/projects/${encodeURIComponent(projectId)}/dependency-health${environmentQuery(
      environmentInstanceId,
      refresh ? { refresh: 'true' } : {},
    )}`,
  );
  return response.health;
}

export async function fetchProjectDependencyUpgradePlan(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ProjectDependencyUpgradePlan> {
  const response = await requestJson<{ plan: ProjectDependencyUpgradePlan }>(
    `/api/projects/${encodeURIComponent(projectId)}/dependency-upgrade-plan${environmentQuery(
      environmentInstanceId,
    )}`,
  );
  return response.plan;
}

export async function fetchProjectBundlerOverview(
  projectId: string,
  environmentInstanceId?: string,
): Promise<BundlerOverview> {
  const response = await requestJson<{ bundler: BundlerOverview }>(
    `/api/projects/${encodeURIComponent(projectId)}/bundler${environmentQuery(
      environmentInstanceId,
    )}`,
  );
  return response.bundler;
}
