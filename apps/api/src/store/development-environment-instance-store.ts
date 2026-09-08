import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  DevelopmentEnvironmentInstance,
  ExecutionContext,
  Project,
} from '@dev-dashboard/contracts';

import type { ProjectStore } from './project-store.js';

const PRIMARY_INSTANCE_ID_PREFIX = 'environment:primary:';
const WORKTREE_INSTANCE_ID_PREFIX = 'environment:worktree:';
const STATE_FILE_NAME = 'development-environment-instances.json';

interface PersistedEnvironmentInstanceState {
  version: 1;
  instances: DevelopmentEnvironmentInstance[];
}

export interface ObservedWorktreeForEnvironmentInstance {
  id: string;
  path: string;
  kind: 'main' | 'linked' | 'unknown';
}

export interface DevelopmentEnvironmentInstanceStoreOptions {
  stateDirectory?: string;
}

type ProjectStoreView = Pick<ProjectStore, 'findProject' | 'listProjects'>;

export function primaryEnvironmentInstanceId(projectId: string): string {
  return `${PRIMARY_INSTANCE_ID_PREFIX}${projectId}`;
}

export function worktreeEnvironmentInstanceId(
  projectId: string,
  worktreeId: string,
): string {
  return `${WORKTREE_INSTANCE_ID_PREFIX}${projectId}:${worktreeId}`;
}

function primaryInstanceForProject(
  project: Project,
  previous?: DevelopmentEnvironmentInstance,
): DevelopmentEnvironmentInstance {
  const runtime = previous?.runtime ?? { kind: 'host' as const };
  const lifecycle =
    previous?.lifecycle === 'degraded' && runtime.kind === 'host'
      ? 'ready'
      : (previous?.lifecycle ?? 'ready');

  return {
    id: primaryEnvironmentInstanceId(project.id),
    projectId: project.id,
    source: {
      kind: 'primary',
      path: project.path,
    },
    runtime,
    lifecycle,
  };
}

function worktreeInstanceForSnapshot(
  projectId: string,
  worktree: ObservedWorktreeForEnvironmentInstance,
  previous?: DevelopmentEnvironmentInstance,
): DevelopmentEnvironmentInstance {
  const runtime = previous?.runtime ?? { kind: 'host' as const };
  const lifecycle =
    previous?.lifecycle === 'degraded' && runtime.kind === 'host'
      ? 'ready'
      : (previous?.lifecycle ?? 'ready');

  return {
    id: worktreeEnvironmentInstanceId(projectId, worktree.id),
    projectId,
    source: {
      kind: 'worktree',
      path: worktree.path,
      worktreeId: worktree.id,
    },
    runtime,
    lifecycle,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPersistedInstance(
  value: unknown,
): value is DevelopmentEnvironmentInstance {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DevelopmentEnvironmentInstance>;
  if (
    !isNonEmptyString(candidate.id) ||
    !isNonEmptyString(candidate.projectId) ||
    !candidate.source ||
    !candidate.runtime ||
    !isNonEmptyString(candidate.source.path) ||
    !path.isAbsolute(candidate.source.path)
  ) {
    return false;
  }

  if (candidate.source.kind === 'primary') {
    if (candidate.id !== primaryEnvironmentInstanceId(candidate.projectId)) {
      return false;
    }
  } else if (candidate.source.kind === 'worktree') {
    if (!isNonEmptyString(candidate.source.worktreeId)) return false;
    if (
      candidate.id !==
      worktreeEnvironmentInstanceId(
        candidate.projectId,
        candidate.source.worktreeId,
      )
    ) {
      return false;
    }
  } else {
    return false;
  }

  if (
    candidate.runtime.kind !== 'host' &&
    candidate.runtime.kind !== 'devcontainer'
  ) {
    return false;
  }
  if (
    candidate.runtime.runtimeId !== undefined &&
    !isNonEmptyString(candidate.runtime.runtimeId)
  ) {
    return false;
  }

  return (
    candidate.lifecycle === 'stopped' ||
    candidate.lifecycle === 'starting' ||
    candidate.lifecycle === 'ready' ||
    candidate.lifecycle === 'degraded' ||
    candidate.lifecycle === 'stopping' ||
    candidate.lifecycle === 'failed'
  );
}

function sameInstance(
  left: DevelopmentEnvironmentInstance | undefined,
  right: DevelopmentEnvironmentInstance,
): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

export class DevelopmentEnvironmentInstanceStore {
  private readonly instances = new Map<
    string,
    DevelopmentEnvironmentInstance
  >();
  private readonly stateFilePath: string | undefined;

  public constructor(
    private readonly projectStore: ProjectStoreView,
    options: DevelopmentEnvironmentInstanceStoreOptions = {},
  ) {
    this.stateFilePath = options.stateDirectory
      ? path.join(options.stateDirectory, STATE_FILE_NAME)
      : undefined;
    this.loadPersistedState();
  }

  public list(): DevelopmentEnvironmentInstance[] {
    this.reconcileCurrentProjects();
    return [...this.instances.values()].sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.source.path.localeCompare(right.source.path) ||
        left.id.localeCompare(right.id),
    );
  }

  public listByProjectId(projectId: string): DevelopmentEnvironmentInstance[] {
    this.reconcileCurrentProjects();
    return this.list().filter((instance) => instance.projectId === projectId);
  }

  public findPrimaryByProjectId(
    projectId: string,
  ): DevelopmentEnvironmentInstance | null {
    this.reconcileCurrentProjects();
    const project = this.projectStore.findProject(projectId);
    if (!project) return null;
    return this.instances.get(primaryEnvironmentInstanceId(projectId)) ?? null;
  }

  public findById(
    environmentInstanceId: string,
  ): DevelopmentEnvironmentInstance | null {
    this.reconcileCurrentProjects();
    return this.instances.get(environmentInstanceId) ?? null;
  }

  /**
   * Persiste uma transição operacional produzida pelo backend. A identidade
   * precisa continuar derivada da origem (`primary` ou `worktree.id`), evitando
   * que outro domínio introduza um segundo identificador para o mesmo ambiente.
   */
  public upsert(instance: DevelopmentEnvironmentInstance): void {
    if (!isPersistedInstance(instance)) {
      throw new Error(
        'Development Environment Instance inválida para persistência.',
      );
    }
    this.instances.set(instance.id, instance);
    this.persistState();
  }

  /**
   * Reconcilia snapshots read-only do Git com a mesma entidade operacional.
   * O checkout principal continua sendo a `primary`; linked worktrees recebem
   * ID determinístico a partir do `worktree.id` estável do observer.
   */
  public reconcileWorktrees(
    projectId: string,
    worktrees: readonly ObservedWorktreeForEnvironmentInstance[],
  ): DevelopmentEnvironmentInstance[] {
    this.reconcileCurrentProjects();
    const project = this.projectStore.findProject(projectId);
    if (!project) return [];

    const observedLinkedIds = new Set<string>();
    let changed = false;

    for (const worktree of worktrees) {
      if (
        worktree.kind === 'main' ||
        path.normalize(worktree.path) === path.normalize(project.path)
      ) {
        continue;
      }
      if (
        worktree.kind !== 'linked' ||
        !isNonEmptyString(worktree.id) ||
        !isNonEmptyString(worktree.path) ||
        !path.isAbsolute(worktree.path)
      ) {
        continue;
      }

      const id = worktreeEnvironmentInstanceId(projectId, worktree.id);
      observedLinkedIds.add(id);
      const next = worktreeInstanceForSnapshot(
        projectId,
        worktree,
        this.instances.get(id),
      );
      if (!sameInstance(this.instances.get(id), next)) {
        this.instances.set(id, next);
        changed = true;
      }
    }

    for (const instance of this.instances.values()) {
      if (
        instance.projectId !== projectId ||
        instance.source.kind !== 'worktree' ||
        observedLinkedIds.has(instance.id) ||
        instance.lifecycle === 'degraded'
      ) {
        continue;
      }
      this.instances.set(instance.id, { ...instance, lifecycle: 'degraded' });
      changed = true;
    }

    if (changed) this.persistState();
    return this.listByProjectId(projectId);
  }

  public resolveExecutionContext(
    environmentInstanceId: string,
  ): ExecutionContext | null {
    const instance = this.findById(environmentInstanceId);
    if (!instance || instance.lifecycle === 'degraded') return null;
    if (!this.projectStore.findProject(instance.projectId)) return null;

    return {
      projectId: instance.projectId,
      environmentInstanceId: instance.id,
      cwd: instance.source.path,
      runtime: instance.runtime.kind,
    };
  }

  /**
   * Resolve a instance pedida somente quando ela pertence ao projeto. Sem um
   * id explícito, preserva a UX atual escolhendo a `primary` determinística.
   * Nenhum path/runtime vindo do browser participa desta resolução.
   */
  public resolveForProject(
    projectId: string,
    environmentInstanceId?: string,
  ): ExecutionContext | null {
    const instance = environmentInstanceId
      ? this.findById(environmentInstanceId)
      : this.findPrimaryByProjectId(projectId);
    if (!instance || instance.projectId !== projectId) return null;
    return this.resolveExecutionContext(instance.id);
  }

  private reconcileCurrentProjects(): void {
    const currentProjects = new Map(
      this.projectStore.listProjects().map((project) => [project.id, project]),
    );
    let changed = false;

    for (const project of currentProjects.values()) {
      const id = primaryEnvironmentInstanceId(project.id);
      const next = primaryInstanceForProject(project, this.instances.get(id));
      if (!sameInstance(this.instances.get(id), next)) {
        this.instances.set(id, next);
        changed = true;
      }
    }

    for (const instance of this.instances.values()) {
      if (
        currentProjects.has(instance.projectId) ||
        instance.lifecycle === 'degraded'
      ) {
        continue;
      }
      this.instances.set(instance.id, { ...instance, lifecycle: 'degraded' });
      changed = true;
    }

    if (changed) this.persistState();
  }

  private loadPersistedState(): void {
    if (!this.stateFilePath) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.stateFilePath, 'utf8'));
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== 'object') return;
    const state = parsed as Partial<PersistedEnvironmentInstanceState>;
    if (state.version !== 1 || !Array.isArray(state.instances)) return;

    for (const instance of state.instances) {
      if (!isPersistedInstance(instance)) continue;
      this.instances.set(instance.id, {
        ...instance,
        lifecycle: 'degraded',
      });
    }
  }

  private persistState(): void {
    if (!this.stateFilePath) return;

    mkdirSync(path.dirname(this.stateFilePath), {
      recursive: true,
      mode: 0o700,
    });
    const tempPath = `${this.stateFilePath}.${process.pid}.tmp`;
    const state: PersistedEnvironmentInstanceState = {
      version: 1,
      instances: [...this.instances.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    };
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(tempPath, this.stateFilePath);
  }
}
