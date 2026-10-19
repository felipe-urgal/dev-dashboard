import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  ProjectServiceBinding,
  ProjectServiceBindingDraft,
} from '@dev-dashboard/contracts';

const FILE_NAME = 'project-service-bindings.json';
const MAX_BYTES = 1024 * 1024;
const MAX_TOTAL = 500;
const MAX_PER_PROJECT = 60;

interface Persisted {
  version: 1;
  bindings: ProjectServiceBinding[];
}

export class ProjectServiceBindingStoreError extends Error {
  public constructor(
    public readonly code: 'CONFLICT' | 'LIMIT' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectServiceBindingStoreError';
  }
}

function validBinding(value: unknown): value is ProjectServiceBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as Partial<ProjectServiceBinding>;
  return (
    typeof b.id === 'string' &&
    /^[0-9a-f-]{36}$/.test(b.id) &&
    typeof b.projectId === 'string' &&
    b.projectId.length > 0 &&
    b.projectId.length <= 160 &&
    typeof b.environmentInstanceId === 'string' &&
    b.environmentInstanceId.length <= 512 &&
    typeof b.serviceRef === 'string' &&
    b.serviceRef.length <= 512 &&
    ['owned', 'required', 'observed'].includes(b.relation ?? '') &&
    typeof b.requiredForStart === 'boolean' &&
    typeof b.enabled === 'boolean' &&
    Array.isArray(b.dependencies) &&
    b.dependencies.length <= 32 &&
    b.dependencies.every(
      (d) =>
        typeof d?.serviceRef === 'string' &&
        d.serviceRef.length > 0 &&
        d.serviceRef.length <= 512 &&
        (d.source === 'manual' || d.source === 'compose') &&
        (d.observedAt === undefined ||
          (typeof d.observedAt === 'string' &&
            !Number.isNaN(Date.parse(d.observedAt)))),
    ) &&
    typeof b.createdAt === 'string' &&
    !Number.isNaN(Date.parse(b.createdAt)) &&
    typeof b.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(b.updatedAt))
  );
}

function normalize(
  bindings: readonly ProjectServiceBinding[],
): ProjectServiceBinding[] {
  return bindings
    .map((binding) => structuredClone(binding))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export class ProjectServiceBindingStore {
  private readonly statePath: string | undefined;
  private readonly bindings = new Map<string, ProjectServiceBinding>();
  private available = true;

  public constructor(options: { stateDirectory?: string } = {}) {
    this.statePath = options.stateDirectory
      ? path.join(options.stateDirectory, FILE_NAME)
      : undefined;
    this.load();
  }

  public list(): ProjectServiceBinding[] {
    return normalize([...this.bindings.values()]);
  }

  public byProject(projectId: string): ProjectServiceBinding[] {
    return this.list().filter((binding) => binding.projectId === projectId);
  }

  public byResource(serviceRef: string): ProjectServiceBinding[] {
    return this.list().filter((binding) => binding.serviceRef === serviceRef);
  }

  public find(id: string): ProjectServiceBinding | null {
    const binding = this.bindings.get(id);
    return binding ? structuredClone(binding) : null;
  }

  public revision(projectId: string): string {
    return createHash('sha256')
      .update(JSON.stringify(this.byProject(projectId)))
      .digest('hex');
  }

  public save(
    projectId: string,
    draft: ProjectServiceBindingDraft & { environmentInstanceId: string },
    expectedRevision: string,
    now: Date,
    id?: string,
  ): ProjectServiceBinding {
    this.assertReady(expectedRevision, projectId);
    const previous = id ? this.bindings.get(id) : undefined;
    if (id && (!previous || previous.projectId !== projectId)) {
      throw new ProjectServiceBindingStoreError(
        'CONFLICT',
        'Binding changed or no longer exists.',
      );
    }
    const duplicate = this.byProject(projectId).find(
      (existing) =>
        existing.environmentInstanceId === draft.environmentInstanceId &&
        existing.serviceRef === draft.serviceRef &&
        existing.id !== id,
    );
    if (
      duplicate &&
      !id &&
      duplicate.relation === draft.relation &&
      duplicate.requiredForStart === draft.requiredForStart &&
      duplicate.enabled === draft.enabled &&
      JSON.stringify(duplicate.dependencies) ===
        JSON.stringify(draft.dependencies)
    ) {
      return duplicate; // Safe POST retry with latest collection revision.
    }
    if (
      previous &&
      previous.environmentInstanceId === draft.environmentInstanceId &&
      previous.serviceRef === draft.serviceRef &&
      previous.relation === draft.relation &&
      previous.requiredForStart === draft.requiredForStart &&
      previous.enabled === draft.enabled &&
      JSON.stringify(previous.dependencies) ===
        JSON.stringify(draft.dependencies)
    ) {
      return structuredClone(previous); // Identical PUT is idempotent.
    }
    if (duplicate) {
      throw new ProjectServiceBindingStoreError(
        'CONFLICT',
        'A binding for this service and environment already exists.',
      );
    }
    if (!previous && this.byProject(projectId).length >= MAX_PER_PROJECT) {
      throw new ProjectServiceBindingStoreError(
        'LIMIT',
        'Project binding limit reached.',
      );
    }
    if (!previous && this.bindings.size >= MAX_TOTAL) {
      throw new ProjectServiceBindingStoreError(
        'LIMIT',
        'Global binding limit reached.',
      );
    }
    const timestamp = now.toISOString();
    const binding: ProjectServiceBinding = {
      id: previous?.id ?? randomUUID(),
      projectId,
      environmentInstanceId: draft.environmentInstanceId,
      serviceRef: draft.serviceRef,
      relation: draft.relation,
      requiredForStart: draft.requiredForStart,
      enabled: draft.enabled,
      dependencies: structuredClone(draft.dependencies),
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    if (
      this.byProject(projectId).some(
        (existing) =>
          existing.id !== binding.id &&
          existing.environmentInstanceId === binding.environmentInstanceId &&
          existing.serviceRef === binding.serviceRef,
      )
    ) {
      throw new ProjectServiceBindingStoreError(
        'CONFLICT',
        'A binding for this service and environment already exists.',
      );
    }
    const before = new Map(this.bindings);
    this.bindings.set(binding.id, binding);
    try {
      this.persist();
    } catch (error) {
      this.bindings.clear();
      for (const [key, record] of before) this.bindings.set(key, record);
      throw error;
    }
    return structuredClone(binding);
  }

  public delete(projectId: string, id: string, expectedRevision: string): void {
    this.assertReady(expectedRevision, projectId);
    if (this.bindings.get(id)?.projectId !== projectId) {
      throw new ProjectServiceBindingStoreError(
        'CONFLICT',
        'Binding changed or no longer exists.',
      );
    }
    const record = this.bindings.get(id)!;
    this.bindings.delete(id);
    try {
      this.persist();
    } catch (error) {
      this.bindings.set(id, record);
      throw error;
    }
  }

  private assertReady(revision: string, projectId: string): void {
    if (!this.available)
      throw new ProjectServiceBindingStoreError(
        'UNAVAILABLE',
        'Binding storage is unavailable. Original state has not been overwritten.',
      );
    if (revision !== this.revision(projectId)) {
      throw new ProjectServiceBindingStoreError(
        'CONFLICT',
        'Bindings have changed. Refresh before retrying.',
      );
    }
  }

  private load(): void {
    if (!this.statePath) return;
    let source: string;
    try {
      source = readFileSync(this.statePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.available = false;
      return;
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_BYTES) {
      this.available = false;
      return;
    }
    try {
      const parsed: unknown = JSON.parse(source);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw Error();
      const state = parsed as Partial<Persisted>;
      if (
        state.version !== 1 ||
        !Array.isArray(state.bindings) ||
        state.bindings.length > MAX_TOTAL ||
        !state.bindings.every(validBinding)
      )
        throw Error();
      const unique = new Set(state.bindings.map((b) => b.id));
      const keys = new Set(
        state.bindings.map(
          (b) =>
            b.projectId + '\0' + b.environmentInstanceId + '\0' + b.serviceRef,
        ),
      );
      if (
        unique.size !== state.bindings.length ||
        keys.size !== state.bindings.length
      )
        throw Error();
      for (const item of state.bindings)
        this.bindings.set(item.id, structuredClone(item));
    } catch {
      // Never reset/overwrite unrecognized state: an explicit migration is required.
      this.available = false;
    }
  }

  private persist(): void {
    if (!this.statePath) return;
    mkdirSync(path.dirname(this.statePath), { recursive: true, mode: 0o700 });
    const temporary = this.statePath + '.' + process.pid + '.tmp';
    const value: Persisted = { version: 1, bindings: this.list() };
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporary, this.statePath);
  }
}
