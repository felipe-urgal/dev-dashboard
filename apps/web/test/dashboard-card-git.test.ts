import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchProjectGit = vi.hoisted(() => vi.fn());
vi.mock('../src/api', () => ({ fetchProjectGit }));
import { getCardGit, invalidateCardGit, resolveCardGit } from '../src/utils/dashboard-card-git';

describe('Git dos cards', () => {
  beforeEach(() => { invalidateCardGit(); fetchProjectGit.mockReset(); });
  it('separa checkout detached de ausência de Git', () => {
    expect(resolveCardGit({ repository: true, detached: true } as never)).toEqual({ kind: 'detached' });
    expect(resolveCardGit({ repository: false } as never)).toEqual({ kind: 'none' });
    expect(resolveCardGit({ repository: true, branch: 'main', detached: false } as never)).toEqual({ kind: 'branch', branch: 'main' });
  });
  it('falha de leitura nunca é Sem Git e chamadas simultâneas reutilizam request', async () => {
    fetchProjectGit.mockRejectedValue(new Error('offline'));
    const [first, second] = await Promise.all([getCardGit('repo'), getCardGit('repo')]);
    expect(first).toEqual({ kind: 'unknown' });
    expect(second).toEqual(first);
    expect(fetchProjectGit).toHaveBeenCalledTimes(1);
    await getCardGit('repo');
    expect(fetchProjectGit).toHaveBeenCalledTimes(1);
  });
});
