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

  it('alterna o tema com um botão e persiste a escolha entre montagens', async () => {
    const first = mount(VisualPreferences);

    expect(first.get('button').attributes('aria-label')).toBe(
      'Mudar para o tema claro',
    );
    await first.get('button').trigger('click');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(first.get('button').attributes('aria-label')).toBe(
      'Mudar para o tema escuro',
    );
    first.unmount();

    // Simula o boot real do app: um novo carregamento relê a preferência
    // persistida em localStorage antes de montar de novo.
    loadVisualPreferences();

    const restored = mount(VisualPreferences);
    expect(restored.get('button').attributes('aria-label')).toBe(
      'Mudar para o tema escuro',
    );
  });
});
