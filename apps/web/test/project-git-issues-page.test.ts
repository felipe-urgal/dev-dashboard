import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GithubIssue } from '../src/api/github-issues';

const api = vi.hoisted(() => ({
  fetchProjectGithubIssues: vi.fn(),
  createProjectGithubIssue: vi.fn(),
  updateProjectGithubIssue: vi.fn(),
  closeProjectGithubIssue: vi.fn(),
  removeProjectGithubIssue: vi.fn(),
  reopenProjectGithubIssue: vi.fn(),
}));

vi.mock('../src/api/github-issues', () => api);

import ProjectGitIssuesPage from '../src/components/ProjectGitIssuesPage.vue';

const issue = (overrides: Partial<GithubIssue>): GithubIssue => ({
  number: 7,
  title: 'Relatório não carrega',
  body: 'Detalhes',
  state: 'open',
  url: 'https://github.com/org/repo/issues/7',
  author: 'dev',
  labels: ['bug'],
  updatedAt: '2026-10-28T10:00:00.000Z',
  ...overrides,
});

function mountPage() {
  return mount(ProjectGitIssuesPage, {
    props: { projectId: 'proj' },
    attachTo: document.body,
  });
}

const buttonByText = (wrapper: ReturnType<typeof mountPage>, text: string) =>
  wrapper.findAll('button').find((button) => button.text() === text)!;

describe('Git → Issues', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchProjectGithubIssues.mockResolvedValue({
      repository: 'org/repo',
      issues: [issue({}), issue({ number: 8, title: 'Outra tarefa' })],
      hasMore: false,
      page: 1,
    });
    api.closeProjectGithubIssue.mockResolvedValue(issue({ state: 'closed' }));
  });

  it('fecha a issue escolhida e recarrega a lista', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const row = wrapper.findAll('article')[1]!;
    await row
      .findAll('button')
      .find((button) => button.text() === 'Fechar')!
      .trigger('click');
    await flushPromises();

    expect(api.closeProjectGithubIssue).toHaveBeenCalledWith('proj', 8);
    expect(api.fetchProjectGithubIssues).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('reabre uma issue fechada', async () => {
    api.fetchProjectGithubIssues.mockResolvedValue({
      repository: 'org/repo',
      issues: [issue({ state: 'closed' })],
      hasMore: false,
      page: 1,
    });
    api.reopenProjectGithubIssue.mockResolvedValue(issue({}));
    const wrapper = mountPage();
    await flushPromises();

    await buttonByText(wrapper, 'Reabrir').trigger('click');
    await flushPromises();

    expect(api.reopenProjectGithubIssue).toHaveBeenCalledWith('proj', 7);
    wrapper.unmount();
  });

  it('remove a issue escolhida após a confirmação e recarrega a lista', async () => {
    api.removeProjectGithubIssue.mockResolvedValue(undefined);
    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .findAll('article')[0]!
      .find('[aria-label="Remover issue #7"]')
      .trigger('click');
    await flushPromises();

    expect(api.removeProjectGithubIssue).toHaveBeenCalledWith('proj', 7);
    expect(api.fetchProjectGithubIssues).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('cria uma issue com título e descrição informados', async () => {
    api.createProjectGithubIssue.mockResolvedValue(issue({ number: 9 }));
    const wrapper = mountPage();
    await flushPromises();

    await buttonByText(wrapper, 'Nova issue').trigger('click');
    await flushPromises();

    const dialog = document.body.querySelector('.git-issue-dialog')!;
    const title = dialog.querySelector('input')!;
    const body = dialog.querySelector('textarea')!;
    title.value = '  Nova tarefa  ';
    title.dispatchEvent(new Event('input'));
    body.value = 'Contexto';
    body.dispatchEvent(new Event('input'));
    await flushPromises();

    dialog.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(api.createProjectGithubIssue).toHaveBeenCalledWith(
      'proj',
      'Nova tarefa',
      'Contexto',
    );
    wrapper.unmount();
  });
});
