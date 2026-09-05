<script setup lang="ts">
import { computed } from 'vue';

import type {
  ProjectEnvironmentContract,
  ProjectEnvironmentContractScope,
  ProjectEnvironmentContractVariable,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  contract: ProjectEnvironmentContract | null;
  loading: boolean;
  errorMessage: string;
}>();

const scopeLabels: Record<ProjectEnvironmentContractScope, string> = {
  default: 'Padrão',
  test: 'Teste',
  production: 'Produção',
  docker: 'Docker',
};

const statusLabels: Record<
  ProjectEnvironmentContractVariable['status'],
  string
> = {
  present: 'Presente',
  missing: 'Ausente',
  undocumented: 'Não documentada',
  duplicate: 'Duplicada',
  'conflicting-source': 'Fonte conflitante',
  optional: 'Opcional',
  unknown: 'Revisar',
};

const actionLabels: Record<
  ProjectEnvironmentContractVariable['suggestedAction'],
  string
> = {
  none: '',
  configure: 'Configurar',
  document: 'Documentar',
  'review-source': 'Revisar fonte',
  'choose-baseline': 'Escolher baseline',
};

const actionableStatuses = new Set<
  ProjectEnvironmentContractVariable['status']
>(['missing', 'undocumented', 'duplicate', 'conflicting-source', 'unknown']);

const sections = computed(() =>
  (props.contract?.sections ?? [])
    .map((section) => ({
      ...section,
      variables: section.variables.filter((variable) =>
        actionableStatuses.has(variable.status),
      ),
    }))
    .filter(
      (section) =>
        section.variables.length > 0 || section.baselineStatus !== 'resolved',
    ),
);

const issueCount = computed(() =>
  sections.value.reduce(
    (total, section) =>
      total +
      section.variables.length +
      Number(section.baselineStatus !== 'resolved'),
    0,
  ),
);
</script>

<template>
  <section class="environment-contract" aria-label="Contrato de ambiente">
    <div class="environment-contract-heading">
      <div>
        <span>Contrato</span>
        <strong>Consistência entre ambientes</strong>
      </div>
      <small v-if="contract && !loading">
        {{ issueCount === 0 ? 'Sem pendências' : `${issueCount} pendência(s)` }}
      </small>
    </div>

    <p v-if="loading && !contract" class="environment-contract-note">
      Comparando nomes e origens das variáveis…
    </p>
    <p
      v-else-if="errorMessage"
      class="environment-contract-error"
      role="status"
    >
      O contrato não pôde ser carregado. A leitura dos arquivos abaixo continua
      disponível.
    </p>
    <p
      v-else-if="contract && sections.length === 0"
      class="environment-contract-ok"
    >
      Os baselines reconhecidos não possuem diferenças estruturais acionáveis.
    </p>

    <div v-else-if="contract" class="environment-contract-sections">
      <article v-for="section in sections" :key="section.scope">
        <header>
          <strong>{{ scopeLabels[section.scope] }}</strong>
          <span v-if="section.baselineStatus === 'resolved'">
            baseline <code>{{ section.baseline }}</code>
          </span>
          <span
            v-else-if="section.baselineStatus === 'ambiguous'"
            class="warning"
          >
            baseline ambíguo: {{ section.baselineCandidates.join(', ') }}
          </span>
          <span v-else class="warning">baseline ausente</span>
        </header>

        <ul v-if="section.variables.length > 0">
          <li v-for="variable in section.variables" :key="variable.name">
            <div>
              <code>{{ variable.name }}</code>
              <span>{{ statusLabels[variable.status] }}</span>
              <small v-if="variable.sensitive">sensível</small>
            </div>
            <p>
              <template v-if="variable.sources.length > 0">
                origem: {{ variable.sources.join(', ') }}
              </template>
              <template v-if="variable.suggestedAction !== 'none'">
                · {{ actionLabels[variable.suggestedAction] }}
              </template>
            </p>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.environment-contract {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.environment-contract-heading,
.environment-contract-heading > div,
.environment-contract-sections,
.environment-contract-sections article {
  display: grid;
  gap: 4px;
}

.environment-contract-heading {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.environment-contract-heading span {
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.environment-contract-heading strong {
  font-size: var(--font-sm);
}

.environment-contract-heading small,
.environment-contract-note,
.environment-contract-error,
.environment-contract-ok,
.environment-contract-sections header span,
.environment-contract-sections li p,
.environment-contract-sections li small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.environment-contract-note,
.environment-contract-error,
.environment-contract-ok,
.environment-contract-sections li p {
  margin: 0;
}

.environment-contract-error,
.environment-contract-sections .warning {
  color: var(--warning-text);
}

.environment-contract-ok {
  color: var(--success-text);
}

.environment-contract-sections {
  gap: var(--space-3);
}

.environment-contract-sections article {
  gap: var(--space-2);
}

.environment-contract-sections header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.environment-contract-sections ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.environment-contract-sections li {
  display: grid;
  gap: 2px;
  padding-left: var(--space-3);
  border-left: 2px solid
    color-mix(in srgb, var(--warning-text) 35%, var(--border));
}

.environment-contract-sections li > div {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.environment-contract-sections li > div > span {
  color: var(--warning-text);
  font-size: var(--font-xs);
  font-weight: 700;
}

@media (max-width: 620px) {
  .environment-contract-heading {
    grid-template-columns: 1fr;
  }
}
</style>
