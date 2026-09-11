import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { test } from 'vitest';

import type { ProjectEnvironmentContract } from '@dev-dashboard/contracts';

import ProjectEnvironmentContractSummary from '../src/components/ProjectEnvironmentContractSummary.vue';

const contract: ProjectEnvironmentContract = {
  sections: [
    {
      scope: 'default',
      baselineStatus: 'resolved',
      baseline: '.env.example',
      baselineCandidates: ['.env.example'],
      sourceFiles: ['.env.example', '.env'],
      variables: [
        {
          name: 'DATABASE_URL',
          sensitive: true,
          status: 'missing',
          baseline: '.env.example',
          sources: ['.env.example'],
          required: true,
          suggestedAction: 'configure',
        },
        {
          name: 'PORT',
          sensitive: false,
          status: 'present',
          baseline: '.env.example',
          sources: ['.env.example', '.env'],
          required: true,
          suggestedAction: 'none',
        },
      ],
    },
    {
      scope: 'production',
      baselineStatus: 'ambiguous',
      baseline: null,
      baselineCandidates: ['.env.production.example', '.env.example'],
      sourceFiles: ['.env.production'],
      variables: [],
    },
  ],
};

test('resume pendências por escopo sem duplicar detalhes do arquivo selecionado', () => {
  const wrapper = mount(ProjectEnvironmentContractSummary, {
    props: { contract, loading: false, errorMessage: '' },
  });

  assert.match(wrapper.text(), /2 pendências/);
  assert.match(wrapper.text(), /Padrão\s*1/);
  assert.match(wrapper.text(), /Produção\s*1/);
  assert.doesNotMatch(wrapper.text(), /DATABASE_URL/);
  assert.doesNotMatch(wrapper.text(), /PORT/);
  assert.doesNotMatch(wrapper.text(), /postgres:\/\//);
});

test('mantém falha do contrato isolada da leitura dos arquivos', () => {
  const wrapper = mount(ProjectEnvironmentContractSummary, {
    props: {
      contract: null,
      loading: false,
      errorMessage: 'falha remota com detalhe interno',
    },
  });

  assert.match(wrapper.text(), /Contrato indisponível/i);
  assert.match(wrapper.text(), /leitura dos arquivos continua disponível/i);
  assert.doesNotMatch(wrapper.text(), /detalhe interno/);
});
