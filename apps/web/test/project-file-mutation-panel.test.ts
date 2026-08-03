import assert from 'node:assert/strict';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
}));

vi.mock('../src/api/project-file-mutations', () => ({
  createProjectFileEntry: api.create,
  previewProjectFileMutation: api.preview,
  applyProjectFileMutation: api.apply,
}));

import ProjectFileMutationPanel from '../src/components/ProjectFileMutationPanel.vue';

beforeEach(() => {
  vi.clearAllMocks();
  api.create.mockResolvedValue({
    operation: 'create',
    path: 'src/new.ts',
    kind: 'file',
  });
  api.preview.mockResolvedValue({
    confirmationToken: 'token-1',
    operation: 'delete',
    path: 'src/nested',
    kind: 'directory',
    affectedFiles: 1,
    affectedDirectories: 1,
    totalBytes: 10,
    requiresPhrase: true,
    confirmationPhrase: 'src/nested',
    expiresAt: '2026-08-03T18:30:00.000Z',
  });
  api.apply.mockResolvedValue({
    operation: 'delete',
    path: 'src/nested',
    kind: 'directory',
  });
});

test('cria arquivo relativo ao item selecionado', async () => {
  const wrapper = mount(ProjectFileMutationPanel, {
    props: {
      projectId: 'project-1',
      selected: {
        path: 'src',
        name: 'src',
        kind: 'directory',
      },
    },
  });

  await wrapper.get('button[aria-label="Criar arquivo"]').trigger('click');
  const input = wrapper.get('input');
  assert.equal((input.element as HTMLInputElement).value, 'src/');
  await input.setValue('src/new.ts');
  await wrapper.get('form').trigger('submit');
  await flushPromises();

  assert.deepEqual(api.create.mock.calls[0], [
    'project-1',
    {
      path: 'src/new.ts',
      kind: 'file',
      content: '',
    },
  ]);
  assert.deepEqual(wrapper.emitted('completed')?.[0]?.[0], {
    operation: 'create',
    path: 'src/new.ts',
    kind: 'file',
  });
});

test('revisa impacto e exige frase para excluir diretório com conteúdo', async () => {
  const wrapper = mount(ProjectFileMutationPanel, {
    props: {
      projectId: 'project-1',
      selected: {
        path: 'src/nested',
        name: 'nested',
        kind: 'directory',
      },
    },
  });

  await wrapper.get('button[aria-label="Excluir item selecionado"]').trigger('click');
  await wrapper.get('form').trigger('submit');
  await flushPromises();

  assert.deepEqual(api.preview.mock.calls[0], [
    'project-1',
    {
      operation: 'delete',
      path: 'src/nested',
    },
  ]);
  assert.match(wrapper.text(), /Impacto: 1 arquivo e 1 pasta/);
  const confirmation = wrapper.get('input');
  await confirmation.setValue('src/nested');
  await wrapper.get('form').trigger('submit');
  await flushPromises();

  assert.deepEqual(api.apply.mock.calls[0], [
    'project-1',
    {
      confirmationToken: 'token-1',
      confirmationPhrase: 'src/nested',
    },
  ]);
  const completed = wrapper.emitted('completed')?.[0]?.[0] as
    | { operation: string }
    | undefined;
  assert.equal(completed?.operation, 'delete');
});

test('bloqueia renomear e excluir quando há edição não salva', () => {
  const wrapper = mount(ProjectFileMutationPanel, {
    props: {
      projectId: 'project-1',
      blocked: true,
      selected: {
        path: 'src/main.ts',
        name: 'main.ts',
        kind: 'file',
      },
    },
  });

  assert.ok(
    wrapper
      .get('button[aria-label="Renomear item selecionado"]')
      .attributes('disabled') !== undefined,
  );
  assert.ok(
    wrapper
      .get('button[aria-label="Excluir item selecionado"]')
      .attributes('disabled') !== undefined,
  );
});
