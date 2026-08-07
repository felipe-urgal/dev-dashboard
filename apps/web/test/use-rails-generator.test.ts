import assert from 'node:assert/strict';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref, type Ref } from 'vue';
import { afterEach, test, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

import { useRailsGenerator } from '../src/composables/useRailsGenerator';

const prepareProjectRailsGenerator = vi.hoisted(() => vi.fn());
const runProjectRailsGenerator = vi.hoisted(() => vi.fn());

vi.mock('../src/api', () => ({
  prepareProjectRailsGenerator,
  runProjectRailsGenerator,
}));

function project(id: string): Project {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    type: 'rails',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

function mountHarness(currentProject: Ref<Project>) {
  let exposed!: ReturnType<typeof useRailsGenerator>;
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useRailsGenerator(() => currentProject.value);
        return {};
      },
      template: '<div />',
    }),
  );
  return {
    wrapper,
    get generator() {
      return exposed;
    },
  };
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  prepareProjectRailsGenerator.mockReset();
  runProjectRailsGenerator.mockReset();
});

test('reset() ao trocar de projeto descarta uma preparação atrasada do projeto anterior', async () => {
  let resolveDelayedPrepareA: ((value: unknown) => void) | undefined;
  prepareProjectRailsGenerator.mockImplementation((projectId: string) => {
    if (projectId === 'projeto-a') {
      return new Promise((resolve) => {
        resolveDelayedPrepareA = resolve;
      });
    }
    return Promise.resolve({ token: `token-${projectId}` });
  });

  const currentProject = ref(project('projeto-a'));
  const { wrapper, generator } = mountHarness(currentProject);
  cleanup = () => wrapper.unmount();

  void generator.prepare('model', 'User', []);
  await flushPromises();
  assert.equal(generator.preparing.value, true);

  // Troca de projeto: o componente pai chamaria reset() aqui, como faz
  // RailsGeneratorForm.vue no watch de props.project.id.
  generator.reset();
  currentProject.value = project('projeto-b');
  assert.equal(generator.preparing.value, false);
  assert.equal(generator.pendingConfirmation.value, null);

  resolveDelayedPrepareA?.({ token: 'token-projeto-a' });
  await flushPromises();

  assert.equal(
    generator.pendingConfirmation.value,
    null,
    'a confirmação atrasada do projeto anterior não deveria aparecer após a troca',
  );
  assert.equal(generator.preparing.value, false);
});
