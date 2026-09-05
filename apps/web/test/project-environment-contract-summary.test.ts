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

test('prioriza diferenças acionáveis sem renderizar valores de ambiente', () => {
  const wrapper = mount(ProjectEnvironmentContractSummary, {
    props: { contract, loading: false, errorMessage: '' },
  });

  assert.match(wrapper.text(), /2 pendência\(s\)/);
  assert.match(wrapper.text(), /DATABASE_URL/);
  assert.match(wrapper.text(), /Ausente/);
  assert.match(wrapper.text(), /sensível/);
  assert.match(wrapper.text(), /Configurar/);
  assert.doesNotMatch(wrapper.text(), /PORT/);
  assert.match(wrapper.text(), /baseline ambíguo/);
  assert.doesNotMatch(wrapper.text(), /postgres:\/\//);
  assert.doesNotMatch(wrapper.text(), /secret/i);
});

test('mantém falha do contrato isolada da leitura tradicional de arquivos', () => {
  const wrapper = mount(ProjectEnvironmentContractSummary, {
    props: {
      contract: null,
      loading: false,
      errorMessage: 'falha remota com detalhe interno',
    },
  });

  assert.match(wrapper.text(), /contrato não pôde ser carregado/i);
  assert.match(wrapper.text(), /leitura dos arquivos abaixo continua disponível/i);
  assert.doesNotMatch(wrapper.text(), /detalhe interno/);
});
