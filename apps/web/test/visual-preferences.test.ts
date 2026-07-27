import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import VisualPreferences from '../src/components/VisualPreferences.vue';
import {
  applyVisualPreferences,
  readVisualPreferences,
} from '../src/utils/visual-preferences';

describe('preferências visuais', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.density;
  });

  afterEach(() => localStorage.clear());

  it('normaliza valores ausentes ou inválidos para defaults seguros', () => {
    localStorage.setItem('dev-dashboard:theme', 'automático');
    localStorage.setItem('dev-dashboard:density', 'enorme');

    expect(readVisualPreferences(localStorage)).toEqual({
      theme: 'dark',
      density: 'comfortable',
    });
  });

  it('aplica somente os atributos fechados no elemento raiz', () => {
    applyVisualPreferences({ theme: 'light', density: 'compact' });

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.density).toBe('compact');
  });

  it('expõe estado selecionado e persiste escolhas entre montagens', async () => {
    const first = mount(VisualPreferences);
    const buttons = first.findAll('button');

    await buttons[1]!.trigger('click');
    await buttons[3]!.trigger('click');

    expect(buttons[1]!.attributes('aria-pressed')).toBe('true');
    expect(buttons[3]!.attributes('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.density).toBe('compact');
    first.unmount();

    const restored = mount(VisualPreferences);
    const restoredButtons = restored.findAll('button');
    expect(restoredButtons[1]!.attributes('aria-pressed')).toBe('true');
    expect(restoredButtons[3]!.attributes('aria-pressed')).toBe('true');
  });
});
