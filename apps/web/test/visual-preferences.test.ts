import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import VisualPreferences from '../src/components/VisualPreferences.vue';
import {
  applyVisualPreferences,
  currentTheme,
  DEFAULT_VISUAL_PREFERENCES,
  loadVisualPreferences,
  readVisualPreferences,
} from '../src/utils/visual-preferences';

describe('preferências visuais', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    currentTheme.value = DEFAULT_VISUAL_PREFERENCES.theme;
  });

  afterEach(() => localStorage.clear());

  it('normaliza valores ausentes ou inválidos para defaults seguros', () => {
    localStorage.setItem('dev-dashboard:theme', 'automático');

    expect(readVisualPreferences(localStorage)).toEqual({
      theme: 'dark',
    });
  });

  it('aplica somente os atributos fechados no elemento raiz', () => {
    applyVisualPreferences({ theme: 'light' });

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('expõe estado selecionado e persiste escolhas entre montagens', async () => {
    const first = mount(VisualPreferences);
    const buttons = first.findAll('button');

    await buttons[1]!.trigger('click');

    expect(buttons[1]!.attributes('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
    first.unmount();

    // Simula o boot real do app: um novo carregamento relê a preferência
    // persistida em localStorage antes de a sidebar montar de novo.
    loadVisualPreferences();

    const restored = mount(VisualPreferences);
    const restoredButtons = restored.findAll('button');
    expect(restoredButtons[1]!.attributes('aria-pressed')).toBe('true');
  });
});
