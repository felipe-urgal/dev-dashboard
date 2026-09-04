import type { ProjectGitOverview } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';

export type ProjectSnapshotStatus = 'loading' | 'ready' | 'error';

export interface ProjectSnapshot<T> {
  status: ProjectSnapshotStatus;
  value: T | null;
  error: unknown | null;
  updatedAt: number | null;
}

interface SnapshotSubscription<T> {
  key: string;
  intervalMs: number;
  load: () => Promise<T>;
  onChange: (snapshot: ProjectSnapshot<T>) => void;
}

interface SnapshotEntry<T> {
  generation: number;
  intervalMs: number;
  listeners: Set<(snapshot: ProjectSnapshot<T>) => void>;
  load: () => Promise<T>;
  running: boolean;
  snapshot: ProjectSnapshot<T>;
  timer?: ReturnType<typeof setTimeout>;
}

export interface ProjectSnapshotRegistry {
  subscribe<T>(subscription: SnapshotSubscription<T>): () => void;
}

function initialSnapshot<T>(): ProjectSnapshot<T> {
  return {
    status: 'loading',
    value: null,
    error: null,
    updatedAt: null,
  };
}

function createEntry<T>(
  subscription: SnapshotSubscription<T>,
): SnapshotEntry<T> {
  return {
    generation: 0,
    intervalMs: subscription.intervalMs,
    listeners: new Set(),
    load: subscription.load,
    running: false,
    snapshot: initialSnapshot<T>(),
  };
}

export function createProjectSnapshotRegistry(): ProjectSnapshotRegistry {
  const entries = new Map<string, SnapshotEntry<unknown>>();

  function isCurrent<T>(key: string, entry: SnapshotEntry<T>): boolean {
    return entries.get(key) === entry;
  }

  function notify<T>(entry: SnapshotEntry<T>): void {
    for (const listener of entry.listeners) listener(entry.snapshot);
  }

  function schedule<T>(key: string, entry: SnapshotEntry<T>): void {
    if (!entry.listeners.size || !isCurrent(key, entry)) return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void refresh(key, entry);
    }, entry.intervalMs);
  }

  function applySuccess<T>(entry: SnapshotEntry<T>, value: T): void {
    entry.snapshot = {
      status: 'ready',
      value,
      error: null,
      updatedAt: Date.now(),
    };
    notify(entry);
  }

  function applyError<T>(entry: SnapshotEntry<T>, error: unknown): void {
    entry.snapshot = {
      ...entry.snapshot,
      status: 'error',
      error,
    };
    notify(entry);
  }

  async function refresh<T>(key: string, entry: SnapshotEntry<T>): Promise<void> {
    if (entry.running || !entry.listeners.size) return;
    const generation = entry.generation;
    entry.running = true;

    try {
      const value = await entry.load();
      if (generation === entry.generation && isCurrent(key, entry)) {
        applySuccess(entry, value);
      }
    } catch (error) {
      if (generation === entry.generation && isCurrent(key, entry)) {
        applyError(entry, error);
      }
    } finally {
      if (generation !== entry.generation || !isCurrent(key, entry)) return;
      entry.running = false;
      schedule(key, entry);
    }
  }

  function stop<T>(key: string, entry: SnapshotEntry<T>): void {
    entry.generation += 1;
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entries.delete(key);
  }

  function subscribe<T>(subscription: SnapshotSubscription<T>): () => void {
    let entry = entries.get(subscription.key) as SnapshotEntry<T> | undefined;
    if (!entry) {
      entry = createEntry(subscription);
      entries.set(subscription.key, entry as SnapshotEntry<unknown>);
    }

    entry.listeners.add(subscription.onChange);
    subscription.onChange(entry.snapshot);
    if (!entry.running && entry.timer === undefined) void refresh(subscription.key, entry);

    return () => {
      entry.listeners.delete(subscription.onChange);
      if (!entry.listeners.size) stop(subscription.key, entry);
    };
  }

  return { subscribe };
}

const projectSnapshotRegistry = createProjectSnapshotRegistry();
const GIT_OVERVIEW_INTERVAL_MS = 3_000;

export function subscribeProjectGitOverview(
  projectId: string,
  onChange: (snapshot: ProjectSnapshot<ProjectGitOverview>) => void,
): () => void {
  return projectSnapshotRegistry.subscribe({
    key: `${projectId}:git-overview`,
    intervalMs: GIT_OVERVIEW_INTERVAL_MS,
    load: () => fetchProjectGit(projectId),
    onChange,
  });
}
