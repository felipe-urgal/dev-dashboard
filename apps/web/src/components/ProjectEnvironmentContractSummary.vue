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

const actionableStatuses = new Set<
  ProjectEnvironmentContractVariable['status']
>(['missing', 'undocumented', 'duplicate', 'conflicting-source', 'unknown']);

const sections = computed(() =>
  (props.contract?.sections ?? []).map((section) => ({
    ...section,
    variables: section.variables.filter((variable) =>
      actionableStatuses.has(variable.status),
    ),
  })),
);

const sectionSummaries = computed(() =>
  sections.value
    .map((section) => ({
      scope: section.scope,
      label: scopeLabels[section.scope],
      count:
        section.variables.length +
        Number(section.baselineStatus !== 'resolved'),
    }))
    .filter((section) => section.count > 0),
);

const issueCount = computed(() =>
  sectionSummaries.value.reduce((total, section) => total + section.count, 0),
);

const issueLabel = computed(() => {
  if (issueCount.value === 0) return 'Sem pendências';
  return `${issueCount.value} ${issueCount.value === 1 ? 'pendência' : 'pendências'}`;
});
</script>

<template>
  <section class="environment-contract" aria-label="Consistência entre ambientes">
    <h3>Consistência</h3>

    <p v-if="loading && !contract" class="environment-contract-note">
      Comparando ambientes…
    </p>
    <p
      v-else-if="errorMessage"
      class="environment-contract-error"
      role="status"
    >
      Contrato indisponível. A leitura dos arquivos continua disponível.
    </p>

    <template v-else-if="contract">
      <strong
        class="environment-contract-count"
        :class="{ 'is-ok': issueCount === 0 }"
      >
        {{ issueLabel }}
      </strong>

      <dl v-if="sectionSummaries.length" class="environment-contract-scopes">
        <div v-for="section in sectionSummaries" :key="section.scope">
          <dt>{{ section.label }}</dt>
          <dd>{{ section.count }}</dd>
        </div>
      </dl>

      <p class="environment-contract-note">
        {{
          issueCount === 0
            ? 'Nenhuma diferença estrutural acionável.'
            : 'Foco no arquivo e nas diferenças relevantes para ele.'
        }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.environment-contract {
  display: grid;
  gap: 12px;
  padding: 18px 16px 0;
  border-top: 1px solid var(--border);
}

.environment-contract h3 {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.environment-contract-count {
  justify-self: start;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning-text) 18%, transparent);
  color: var(--warning-text);
  font-size: var(--font-xs);
  font-weight: 800;
}

.environment-contract-count.is-ok {
  background: color-mix(in srgb, var(--success-text) 14%, transparent);
  color: var(--success-text);
}

.environment-contract-scopes {
  display: grid;
  gap: 8px;
  margin: 0;
}

.environment-contract-scopes > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  margin: 0;
  font-size: var(--font-xs);
}

.environment-contract-scopes dt {
  color: var(--text);
  font-weight: 700;
}

.environment-contract-scopes dd {
  margin: 0;
  color: var(--warning-text);
  font-weight: 800;
}

.environment-contract-note,
.environment-contract-error {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
  line-height: 1.5;
}

.environment-contract-error {
  color: var(--warning-text);
}
</style>
