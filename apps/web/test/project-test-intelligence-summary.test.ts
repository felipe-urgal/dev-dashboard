import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { test } from 'vitest';

import type { TestIntelligenceSuggestion } from '@dev-dashboard/contracts';

import ProjectTestIntelligenceSummary from '../src/components/ProjectTestIntelligenceSummary.vue';

function suggestion(
  overrides: Partial<TestIntelligenceSuggestion> = {},
): TestIntelligenceSuggestion {
  return {
    commandId: 'test',
    state: 'direct',
    recommendation: 'targeted',
    baseBranch: 'main',
    currentBranch: 'feature/601-test-intelligence-ui',
    changedFiles: ['src/foo.ts'],
    testFiles: ['test/foo.test.ts'],
    unmappedFiles: [],
    evidence: [
      {
        kind: 'direct-file-match',
        changedFile: 'src/foo.ts',
        testFiles: ['test/foo.test.ts'],
      },
    ],
    ...overrides,
  };
}

test('apresenta targeted somente quando a sugestão recebida é direcionada', () => {
  const wrapper = mount(ProjectTestIntelligenceSummary, {
    props: {
      suggestion: suggestion(),
      loading: false,
      errorMessage: '',
    },
  });

  assert.match(wrapper.text(), /Testes direcionados encontrados/);
  assert.match(wrapper.text(), /Todos os 1 arquivo\(s\) alterado\(s\)/);
  assert.match(wrapper.text(), /test\/foo\.test\.ts/);
  assert.match(wrapper.text(), /não inicia testes automaticamente/);
  assert.match(wrapper.text(), /main → feature\/601-test-intelligence-ui/);
});

test('mantém recomendação de suíte completa quando existe arquivo sem mapeamento', () => {
  const wrapper = mount(ProjectTestIntelligenceSummary, {
    props: {
      suggestion: suggestion({
        state: 'unknown',
        recommendation: 'full-suite',
        changedFiles: ['src/foo.ts', 'src/bar.ts'],
        testFiles: ['test/foo.test.ts'],
        unmappedFiles: ['src/bar.ts'],
      }),
      loading: false,
      errorMessage: '',
    },
  });

  assert.match(wrapper.text(), /Suíte completa recomendada/);
  assert.match(wrapper.text(), /1 arquivo\(s\).*sem mapeamento direto/);
  assert.doesNotMatch(wrapper.text(), /equivalente à suíte completa.*direcionados/s);
});

test('falha do suggestion engine degrada para recomendação segura', () => {
  const wrapper = mount(ProjectTestIntelligenceSummary, {
    props: {
      suggestion: null,
      loading: false,
      errorMessage: 'detalhe interno do provider',
    },
  });

  assert.match(wrapper.text(), /Execute a suíte completa/);
  assert.doesNotMatch(wrapper.text(), /detalhe interno/);
});
