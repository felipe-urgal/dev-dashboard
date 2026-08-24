import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import ProjectGitBranchesPage from '../src/components/ProjectGitBranchesPage.vue';

const wrappers: VueWrapper[] = [];

function mountBranches(): VueWrapper {
  const branch = 'bugfix/ajustar-layout';
  const wrapper = mount(ProjectGitBranchesPage, {
    attachTo: document.body,
    props: {
      overview: { branch } as any,
      workspace: {
        branches: [
          {
            kind: 'local',
            name: branch,
            shortName: branch,
            current: true,
            ahead: 2,
            latestCommit: {
              subject: 'fix: estabiliza nome acessível do botão de filtros',
            },
          },
          {
            kind: 'remote',
            name: `origin/${branch}`,
            shortName: branch,
            remote: 'origin',
          },
        ],
        remotes: [],
      } as any,
      loading: false,
      busy: false,
      remoteRefreshing: false,
      squashCommitCount: 2,
      forcePushBranch: null,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function buttonByText(label: string): HTMLButtonElement {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Botão não encontrado: ${label}`);
  return button;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

it('foca, edita e envia a mensagem informada no squash', async () => {
  const wrapper = mountBranches();

  buttonByText('Squash').click();
  await flushPromises();

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Mensagem do commit final"]',
  );
  expect(input).not.toBeNull();
  expect(input?.disabled).toBe(false);

  await vi.waitFor(() => expect(document.activeElement).toBe(input));

  input!.value = 'feat: mensagem final escolhida pelo usuário';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  expect(input?.value).toBe('feat: mensagem final escolhida pelo usuário');

  buttonByText('Fazer squash').click();
  await flushPromises();

  expect(wrapper.emitted('squash')).toEqual([
    ['bugfix/ajustar-layout', 'feat: mensagem final escolhida pelo usuário'],
  ]);
});

it('mantém a mensagem editável se uma operação ficar ocupada com o modal aberto', async () => {
  const wrapper = mountBranches();

  buttonByText('Squash').click();
  await flushPromises();
  await wrapper.setProps({ busy: true });
  await flushPromises();

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Mensagem do commit final"]',
  )!;
  const submit = buttonByText('Fazer squash');

  expect(input.disabled).toBe(false);
  expect(submit.disabled).toBe(true);

  input.value = 'fix: mensagem continua editável';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  expect(input.value).toBe('fix: mensagem continua editável');
});
