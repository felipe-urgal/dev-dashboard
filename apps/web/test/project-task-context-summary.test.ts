import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  TaskContext,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';

const fetchTaskContexts = vi.hoisted(() => vi.fn());
const fetchTaskContextSnapshot = vi.hoisted(() => vi.fn());

vi.mock('../src/api', async () => {
  const actual = await vi.importActual('../src/api');
  return {
    ...actual,
    fetchTaskContexts,
    fetchTaskContextSnapshot,
  };
});

import ProjectTaskContextSummary from '../src/components/ProjectTaskContextSummary.vue';

const contexts: TaskContext[] = [
  {
    id: 'context-a',
    projectId: 'project-a',
    branch: 'feature/a',
    environmentInstanceId: 'environment:primary:project-a',
    issue: { repository: 'felipe-urgal/dev-dashboard', number: 599 },
    pullRequest: { repository: 'felipe-urgal/dev-dashboard', number: 788 },
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:10:00.000Z',
  },
  {
    id: 'context-b',
    projectId: 'project-a',
    branch: 'feature/b',
    environmentInstanceId: 'environment:primary:project-a',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:11:00.000Z',
  },
];

function snapshot(context: TaskContext): TaskContextSnapshot {
  return {
    context,
    evidence: {
      observedAt: '2026-09-19T10:20:00.000Z',
      currentBranch: 'feature/a',
      branchMatches: context.branch === 'feature/a',
      ...(context.id === 'context-a'
        ? {
            readiness: {
              status: 'pass',
              observedAt: '2026-09-19T10:19:00.000Z',
            },
            pullRequest: {
              provider: 'github',
              number: 788,
              title: 'Task Context',
              url: 'https://github.com/felipe-urgal/dev-dashboard/pull/788',
              sourceBranch: 'feature/a',
              baseBranch: 'main',
              ciStatus: 'success',
            },
          }
        : {}),
    },
  };
}

describe('ProjectTaskContextSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchTaskContexts.mockResolvedValue(contexts);
    fetchTaskContextSnapshot.mockImplementation(
      async (_projectId: string, id: string) =>
        snapshot(contexts.find((context) => context.id === id)!),
    );
  });

  it('prioriza o contexto da branch/Environment Instance e mostra links úteis', async () => {
    const wrapper = mount(ProjectTaskContextSummary, {
      props: {
        projectId: 'project-a',
        currentBranch: 'feature/a',
      },
    });

    await flushPromises();

    expect(fetchTaskContexts).toHaveBeenCalledWith(
      'project-a',
      expect.any(AbortSignal),
    );
    expect(fetchTaskContextSnapshot).toHaveBeenCalledWith(
      'project-a',
      'context-a',
      expect.any(AbortSignal),
    );
    expect(wrapper.text()).toContain('feature/a');
    expect(wrapper.text()).toContain('Issue #599');
    expect(wrapper.text()).toContain('PR #788');
    expect(wrapper.text()).toContain('Pronto');
    expect(wrapper.text()).toContain('CI verde');

    const links = wrapper.findAll('a');
    expect(links[0]?.attributes('href')).toBe(
      'https://github.com/felipe-urgal/dev-dashboard/issues/599',
    );
    expect(links[1]?.attributes('href')).toBe(
      'https://github.com/felipe-urgal/dev-dashboard/pull/788',
    );
  });

  it('troca apenas a visualização do contexto e sinaliza branch divergente', async () => {
    const wrapper = mount(ProjectTaskContextSummary, {
      props: {
        projectId: 'project-a',
        currentBranch: 'feature/a',
      },
    });
    await flushPromises();

    await wrapper.get('select').setValue('context-b');
    await flushPromises();

    expect(fetchTaskContextSnapshot).toHaveBeenLastCalledWith(
      'project-a',
      'context-b',
      expect.any(AbortSignal),
    );
    expect(wrapper.text()).toContain('Branch diferente');
    expect(wrapper.text()).toContain(
      'Trocar o contexto aqui não altera branch, worktree ou runtime.',
    );
  });

  it('mantém estado vazio explícito', async () => {
    fetchTaskContexts.mockResolvedValueOnce([]);
    const wrapper = mount(ProjectTaskContextSummary, {
      props: { projectId: 'project-a', currentBranch: 'main' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Nenhum contexto associado.');
    expect(fetchTaskContextSnapshot).not.toHaveBeenCalled();
  });
});
