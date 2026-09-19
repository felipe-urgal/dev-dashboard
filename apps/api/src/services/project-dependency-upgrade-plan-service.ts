import type { Project } from '@dev-dashboard/contracts';

import type {
  NodeDependencyInventory,
  NodeDependencyInventoryEntry,
} from './node-dependency-inventory-service.js';
import type {
  DependencyUpdateKind,
  NpmDependencyMetadata,
} from './npm-dependency-metadata-service.js';
import type { OsvDependencyAdvisoryEvidence } from './osv-dependency-advisory-service.js';
import type {
  ProjectDependencyHealthService,
  ProjectDependencyHealthSnapshot,
} from './project-dependency-health-service.js';

export type DependencyUpgradePlanStatus = 'ready' | 'partial' | 'unavailable';
export type DependencyUpgradeItemState = 'upgrade' | 'current' | 'unknown';
export type DependencyUpgradeAffectedFile =
  'package.json' | 'package-lock.json';
export type DependencyUpgradeGate =
  | 'resolve-current-version'
  | 'refresh-metadata'
  | 'review-major-change'
  | 'verify-node-runtime'
  | 'update-node-runtime'
  | 'review-current-advisories'
  | 'refresh-current-advisories'
  | 'verify-target-advisories'
  | 'run-tests';

export interface DependencyUpgradePlanItem {
  name: string;
  kind: NodeDependencyInventoryEntry['kind'];
  declaredRange: string;
  state: DependencyUpgradeItemState;
  update: DependencyUpdateKind;
  currentVersion?: string;
  targetVersion?: string;
  affectedFiles: DependencyUpgradeAffectedFile[];
  warnings: string[];
  gates: DependencyUpgradeGate[];
}

export interface DependencyUpgradePlanGroup {
  id: string;
  basis: 'shared-manifest';
  dependencies: string[];
  affectedFiles: DependencyUpgradeAffectedFile[];
  lockstep: 'unknown';
}

export interface ProjectDependencyUpgradePlan {
  generatedAt: string;
  projectId: string;
  packageManager: 'npm';
  status: DependencyUpgradePlanStatus;
  items: DependencyUpgradePlanItem[];
  groups: DependencyUpgradePlanGroup[];
  warnings: string[];
}

export interface ProjectDependencyUpgradePlanServiceOptions {
  dependencyHealthService: Pick<ProjectDependencyHealthService, 'inspect'>;
}

function addUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function currentVersion(
  dependency: NodeDependencyInventoryEntry,
): string | undefined {
  return dependency.resolution === 'resolved'
    ? dependency.resolvedVersion
    : undefined;
}

function affectedFiles(
  inventory: NodeDependencyInventory,
): DependencyUpgradeAffectedFile[] {
  return inventory.lockfile === 'present'
    ? ['package.json', 'package-lock.json']
    : ['package.json'];
}

function findMetadata(
  snapshot: ProjectDependencyHealthSnapshot,
  dependencyName: string,
): NpmDependencyMetadata | undefined {
  return snapshot.metadata.find((item) => item.name === dependencyName);
}

function findAdvisory(
  snapshot: ProjectDependencyHealthSnapshot,
  dependencyName: string,
): OsvDependencyAdvisoryEvidence | undefined {
  return snapshot.advisories.find((item) => item.name === dependencyName);
}

function itemState(
  dependency: NodeDependencyInventoryEntry,
  metadata: NpmDependencyMetadata | undefined,
): DependencyUpgradeItemState {
  if (
    dependency.resolution !== 'resolved' ||
    !dependency.resolvedVersion ||
    !metadata ||
    metadata.state !== 'available' ||
    !metadata.latestVersion ||
    metadata.update === 'unknown'
  ) {
    return 'unknown';
  }

  return metadata.update === 'none' ? 'current' : 'upgrade';
}

function buildItem(
  snapshot: ProjectDependencyHealthSnapshot,
  dependency: NodeDependencyInventoryEntry,
): DependencyUpgradePlanItem {
  const metadata = findMetadata(snapshot, dependency.name);
  const advisory = findAdvisory(snapshot, dependency.name);
  const state = itemState(dependency, metadata);
  const warnings: string[] = [];
  const gates: DependencyUpgradeGate[] = [];
  const update = metadata?.update ?? 'unknown';
  const resolvedVersion = currentVersion(dependency);
  const targetVersion =
    metadata?.state === 'available' ? metadata.latestVersion : undefined;

  if (state === 'unknown') {
    if (dependency.resolution !== 'resolved' || !dependency.resolvedVersion) {
      addUnique(gates, 'resolve-current-version');
      addUnique(
        warnings,
        'A versão atual não foi comprovada; o planner não pode classificar esta atualização.',
      );
    }
    if (
      !metadata ||
      metadata.state !== 'available' ||
      !metadata.latestVersion
    ) {
      addUnique(gates, 'refresh-metadata');
      addUnique(
        warnings,
        'A versão alvo não foi comprovada pela metadata npm nesta atualização.',
      );
    }

    return {
      name: dependency.name,
      kind: dependency.kind,
      declaredRange: dependency.declaredRange,
      state,
      update,
      ...(resolvedVersion ? { currentVersion: resolvedVersion } : {}),
      ...(targetVersion ? { targetVersion } : {}),
      affectedFiles: [],
      warnings,
      gates,
    };
  }

  if (state === 'current') {
    return {
      name: dependency.name,
      kind: dependency.kind,
      declaredRange: dependency.declaredRange,
      state,
      update,
      currentVersion: dependency.resolvedVersion!,
      targetVersion: metadata!.latestVersion!,
      affectedFiles: [],
      warnings,
      gates,
    };
  }

  if (update === 'major') {
    addUnique(gates, 'review-major-change');
    addUnique(
      warnings,
      'A atualização é major e pode conter breaking changes; o planner não afirma compatibilidade de API.',
    );
  }

  if (metadata!.latestRuntimeCompatibility === 'incompatible') {
    addUnique(gates, 'update-node-runtime');
    addUnique(
      warnings,
      'A versão alvo declara um requisito de Node incompatível com o runtime comprovado do projeto.',
    );
  } else if (metadata!.latestRuntimeCompatibility === 'unknown') {
    addUnique(gates, 'verify-node-runtime');
    addUnique(
      warnings,
      'A compatibilidade do runtime Node com a versão alvo não foi comprovada.',
    );
  }

  if (advisory?.state === 'available' && advisory.complete) {
    if (advisory.advisories.length > 0) {
      addUnique(gates, 'review-current-advisories');
      addUnique(
        warnings,
        'A versão atual possui advisories conhecidos; revisar a evidência antes de aplicar o upgrade.',
      );
    }
  } else {
    addUnique(gates, 'refresh-current-advisories');
    addUnique(
      warnings,
      'A evidência de advisories da versão atual está incompleta ou indisponível.',
    );
  }

  addUnique(gates, 'verify-target-advisories');
  addUnique(gates, 'run-tests');

  return {
    name: dependency.name,
    kind: dependency.kind,
    declaredRange: dependency.declaredRange,
    state,
    update,
    currentVersion: dependency.resolvedVersion!,
    targetVersion: metadata!.latestVersion!,
    affectedFiles: affectedFiles(snapshot.inventory),
    warnings,
    gates,
  };
}

function groupUpgradeItems(
  items: DependencyUpgradePlanItem[],
): DependencyUpgradePlanGroup[] {
  const upgrades = items.filter((item) => item.state === 'upgrade');
  if (upgrades.length === 0) return [];

  const files: DependencyUpgradeAffectedFile[] = [];
  for (const item of upgrades) {
    for (const file of item.affectedFiles) addUnique(files, file);
  }

  return [
    {
      id: 'root-package-manifest',
      basis: 'shared-manifest',
      dependencies: upgrades.map((item) => item.name),
      affectedFiles: files,
      lockstep: 'unknown',
    },
  ];
}

function planStatus(
  inventory: NodeDependencyInventory,
  items: DependencyUpgradePlanItem[],
): DependencyUpgradePlanStatus {
  if (inventory.status !== 'ready') return 'unavailable';
  return items.some((item) => item.state === 'unknown') ? 'partial' : 'ready';
}

export class ProjectDependencyUpgradePlanService {
  private readonly dependencyHealthService: Pick<
    ProjectDependencyHealthService,
    'inspect'
  >;

  public constructor(options: ProjectDependencyUpgradePlanServiceOptions) {
    this.dependencyHealthService = options.dependencyHealthService;
  }

  public async inspect(
    project: Project,
  ): Promise<ProjectDependencyUpgradePlan> {
    const snapshot = await this.dependencyHealthService.inspect(project);
    const items =
      snapshot.inventory.status === 'ready'
        ? snapshot.inventory.dependencies.map((dependency) =>
            buildItem(snapshot, dependency),
          )
        : [];

    return {
      generatedAt: snapshot.generatedAt,
      projectId: snapshot.inventory.projectId,
      packageManager: snapshot.inventory.packageManager,
      status: planStatus(snapshot.inventory, items),
      items,
      groups: groupUpgradeItems(items),
      warnings: [...snapshot.inventory.warnings],
    };
  }
}
