import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectGitOverview } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  fetchProjectGit: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectGit: api.fetchProjectGit,
}));

import {
  createProjectSnapshotRegistry,
  subscribeProjectGitOverview,
  type ProjectSnapshot,
} from '../src/stores/project-live-state';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('estado vivo por projeto', () => {
  it('compartilha um único polling entre consumidores da mesma chave', async () => {
    vi.useFakeTimers();
    const registry = createProjectSnapshotRegistry();
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('primeiro')
      .mockResolvedValueOnce('segundo');
    const first: ProjectSnapshot<string>[] = [];
    const second: ProjectSnapshot<string>[] = [];

    const stopFirst = registry.subscribe({
      key: 'projeto-1:git-overview',
      intervalMs: 3_000,
      load,
      onChange: (snapshot) => first.push(snapshot),
    });
    const stopSecond = registry.subscribe({
      key: 'projeto-1:git-overview',
      intervalMs: 3_000,
      load,
      onChange: (snapshot) => second.push(snapshot),
    });

    expect(load).toHaveBeenCalledTimes(1);
    await flushAsyncWork();
    expect(first.at(-1)).toMatchObject({ status: 'ready', value: 'primeiro' });
    expect(second.at(-1)).toMatchObject({ status: 'ready', value: 'primeiro' });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(first.at(-1)).toMatchObject({ status: 'ready', value: 'segundo' });
    expect(second.at(-1)).toMatchObject({ status: 'ready', value: 'segundo' });

    stopFirst();
    stopSecond();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('descarta resposta antiga depois que o último consumidor sai', async () => {
    const registry = createProjectSnapshotRegistry();
    let resolveLoad: ((value: string) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const listener = vi.fn();

    const stop = registry.subscribe({
      key: 'projeto-1:git-overview',
      intervalMs: 3_000,
      load,
      onChange: listener,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    resolveLoad?.('obsoleto');
    await flushAsyncWork();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('mantém o ciclo ativo após erro temporário e publica a recuperação', async () => {
    vi.useFakeTimers();
    const registry = createProjectSnapshotRegistry();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporário'))
      .mockResolvedValueOnce('recuperado');
    const snapshots: ProjectSnapshot<string>[] = [];

    const stop = registry.subscribe({
      key: 'projeto-1:git-overview',
      intervalMs: 3_000,
      load,
      onChange: (snapshot) => snapshots.push(snapshot),
    });

    await flushAsyncWork();
    expect(snapshots.at(-1)?.status).toBe('error');

    await vi.advanceTimersByTimeAsync(3_000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(snapshots.at(-1)).toMatchObject({
      status: 'ready',
      value: 'recuperado',
      error: null,
    });

    stop();
  });

  it('usa o mesmo registry para o snapshot de Git do projeto', async () => {
    vi.useFakeTimers();
    const overview = { branch: 'main' } as ProjectGitOverview;
    api.fetchProjectGit.mockResolvedValueOnce(overview);
    const listener = vi.fn();

    const stop = subscribeProjectGitOverview('projeto-1', listener);
    await flushAsyncWork();

    expect(api.fetchProjectGit).toHaveBeenCalledOnce();
    expect(api.fetchProjectGit).toHaveBeenCalledWith('projeto-1');
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ready', value: overview }),
    );

    stop();
  });
});
