import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  ServiceRuntimeProfile,
  ServiceRuntimeProfileDraft,
} from '@dev-dashboard/contracts';

const FILE_NAME = 'service-runtime-profiles.json';
const MAX_BYTES = 1024 * 1024;
const MAX_TOTAL = 400;
const MAX_PER_PROJECT = 60;
const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Persisted {
  version: 1;
  profiles: ServiceRuntimeProfile[];
}

export class ServiceRuntimeProfileStoreError extends Error {
  constructor(
    public readonly code: 'CONFLICT' | 'LIMIT' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceRuntimeProfileStoreError';
  }
}

function valid(value: unknown): value is ServiceRuntimeProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Partial<ServiceRuntimeProfile>;
  return (
    typeof p.id === 'string' &&
    ID_PATTERN.test(p.id) &&
    typeof p.projectId === 'string' &&
    p.projectId.length > 0 &&
    p.projectId.length <= 160 &&
    typeof p.environmentInstanceId === 'string' &&
    p.environmentInstanceId.length > 0 &&
    p.environmentInstanceId.length <= 512 &&
    (p.kind === 'dev' || p.kind === 'test' || p.kind === 'production') &&
    Array.isArray(p.bindingIds) &&
    p.bindingIds.length <= 60 &&
    p.bindingIds.every((id) => typeof id === 'string' && ID_PATTERN.test(id)) &&
    new Set(p.bindingIds).size === p.bindingIds.length &&
    typeof p.createdAt === 'string' &&
    !Number.isNaN(Date.parse(p.createdAt)) &&
    typeof p.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(p.updatedAt))
  );
}

export class ServiceRuntimeProfileStore {
  private readonly statePath: string | undefined;
  private readonly profiles = new Map<string, ServiceRuntimeProfile>();
  private available = true;

  constructor(options: { stateDirectory?: string } = {}) {
    this.statePath = options.stateDirectory
      ? path.join(options.stateDirectory, FILE_NAME)
      : undefined;
    this.load();
  }

  list(): ServiceRuntimeProfile[] {
    return [...this.profiles.values()]
      .map((profile) => structuredClone(profile))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  byProject(projectId: string): ServiceRuntimeProfile[] {
    return this.list().filter((profile) => profile.projectId === projectId);
  }

  byBinding(bindingId: string): ServiceRuntimeProfile[] {
    return this.list().filter((profile) =>
      profile.bindingIds.includes(bindingId),
    );
  }

  find(id: string): ServiceRuntimeProfile | null {
    const record = this.profiles.get(id);
    return record ? structuredClone(record) : null;
  }

  revision(projectId: string): string {
    return createHash('sha256')
      .update(JSON.stringify(this.byProject(projectId)))
      .digest('hex');
  }

  save(
    projectId: string,
    draft: ServiceRuntimeProfileDraft,
    expectedRevision: string,
    now: Date,
    id?: string,
  ): ServiceRuntimeProfile {
    this.assertReady(projectId, expectedRevision);
    const previous = id ? this.profiles.get(id) : undefined;
    if (
      id &&
      (!previous ||
        previous.projectId !== projectId ||
        previous.environmentInstanceId !== draft.environmentInstanceId)
    ) {
      throw new ServiceRuntimeProfileStoreError(
        'CONFLICT',
        'Profile changed or no longer exists.',
      );
    }
    if (
      this.byProject(projectId).some(
        (profile) =>
          profile.id !== id &&
          profile.environmentInstanceId === draft.environmentInstanceId &&
          profile.kind === draft.kind,
      )
    ) {
      throw new ServiceRuntimeProfileStoreError(
        'CONFLICT',
        'This environment already has a profile of that kind.',
      );
    }
    const ids = [...draft.bindingIds].sort();
    if (
      previous?.environmentInstanceId === draft.environmentInstanceId &&
      previous.kind === draft.kind &&
      JSON.stringify(previous.bindingIds) === JSON.stringify(ids)
    )
      return structuredClone(previous);

    if (
      !previous &&
      (this.profiles.size >= MAX_TOTAL ||
        this.byProject(projectId).length >= MAX_PER_PROJECT)
    ) {
      throw new ServiceRuntimeProfileStoreError(
        'LIMIT',
        'Runtime profile limit reached.',
      );
    }
    const timestamp = now.toISOString();
    const record: ServiceRuntimeProfile = {
      id: previous?.id ?? randomUUID(),
      projectId,
      environmentInstanceId: draft.environmentInstanceId,
      kind: draft.kind,
      bindingIds: ids,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const old = new Map(this.profiles);
    this.profiles.set(record.id, record);
    try {
      this.persist();
    } catch (error) {
      this.profiles.clear();
      for (const [key, value] of old) this.profiles.set(key, value);
      throw error;
    }
    return structuredClone(record);
  }

  delete(projectId: string, id: string, expectedRevision: string): void {
    this.assertReady(projectId, expectedRevision);
    const previous = this.profiles.get(id);
    if (!previous || previous.projectId !== projectId) {
      throw new ServiceRuntimeProfileStoreError(
        'CONFLICT',
        'Profile changed or no longer exists.',
      );
    }
    this.profiles.delete(id);
    try {
      this.persist();
    } catch (error) {
      this.profiles.set(id, previous);
      throw error;
    }
  }

  private assertReady(projectId: string, expectedRevision: string): void {
    if (!this.available) {
      throw new ServiceRuntimeProfileStoreError(
        'UNAVAILABLE',
        'Unrecognized profile storage; original state was preserved.',
      );
    }
    if (expectedRevision !== this.revision(projectId)) {
      throw new ServiceRuntimeProfileStoreError(
        'CONFLICT',
        'Runtime profiles changed. Refresh before retrying.',
      );
    }
  }

  private load(): void {
    if (!this.statePath) return;
    let content: string;
    try {
      content = readFileSync(this.statePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.available = false;
      return;
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
      this.available = false;
      return;
    }
    try {
      const state: unknown = JSON.parse(content);
      if (!state || typeof state !== 'object' || Array.isArray(state))
        throw Error();
      const parsed = state as Partial<Persisted>;
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.profiles) ||
        parsed.profiles.length > MAX_TOTAL ||
        !parsed.profiles.every(valid)
      )
        throw Error();
      const identities = new Set(parsed.profiles.map((p) => p.id));
      const keys = new Set(
        parsed.profiles.map(
          (p) => p.projectId + '\0' + p.environmentInstanceId + '\0' + p.kind,
        ),
      );
      if (
        identities.size !== parsed.profiles.length ||
        keys.size !== parsed.profiles.length ||
        parsed.profiles.some(
          (p) =>
            parsed.profiles!.filter((other) => other.projectId === p.projectId)
              .length > MAX_PER_PROJECT,
        )
      )
        throw Error();
      for (const profile of parsed.profiles)
        this.profiles.set(profile.id, structuredClone(profile));
    } catch {
      // Unknown versions and corrupt files are never silently replaced.
      this.available = false;
    }
  }

  private persist(): void {
    if (!this.statePath) return;
    mkdirSync(path.dirname(this.statePath), { recursive: true, mode: 0o700 });
    const temporary = this.statePath + '.' + process.pid + '.tmp';
    const state: Persisted = { version: 1, profiles: this.list() };
    writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporary, this.statePath);
  }
}
