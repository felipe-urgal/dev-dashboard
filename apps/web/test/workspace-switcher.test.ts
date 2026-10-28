import { mount } from '@vue/test-utils';
import { NDropdown } from 'naive-ui';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '@dev-dashboard/contracts';

import WorkspaceSwitcher from '../src/components/WorkspaceSwitcher.vue';

const workspaces: Workspace[] = [
  { id: 'w1', name: 'Caiena', path: '/a', enabled: true, recursiveScan: false },
  {
    id: 'w2',
    name: 'Pessoais',
    path: '/b',
    enabled: true,
    recursiveScan: false,
  },
];

function mountSwitcher(items: Workspace[] = workspaces) {
  return mount(WorkspaceSwitcher, {
    props: { workspaces: items, selectedId: 'w1' },
  });
}

describe('WorkspaceSwitcher', () => {
  it('troca de workspace, ignora o ativo e abre o cadastro', () => {
    const wrapper = mountSwitcher();
    const dropdown = wrapper.getComponent(NDropdown);

    expect(wrapper.get('button').attributes('aria-label')).toBe(
      'Workspace ativo: Caiena. Trocar workspace',
    );

    dropdown.vm.$emit('select', 'w1');
    dropdown.vm.$emit('select', 'w2');
    dropdown.vm.$emit('select', '__add-workspace__');

    expect(wrapper.emitted('select')).toEqual([['w2']]);
    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('sem workspaces oferece apenas o cadastro', async () => {
    const wrapper = mountSwitcher([]);

    await wrapper.get('button').trigger('click');

    expect(wrapper.text()).toBe('Adicionar workspace');
    expect(wrapper.emitted('add')).toHaveLength(1);
  });
});
