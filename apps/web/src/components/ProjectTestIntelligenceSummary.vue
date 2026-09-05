<script setup lang="ts">
import { computed } from 'vue';

import type { TestIntelligenceSuggestion } from '@dev-dashboard/contracts';

const props = defineProps<{
  suggestion: TestIntelligenceSuggestion | null;
  loading: boolean;
  errorMessage: string;
}>();

const visibleTests = computed(() => props.suggestion?.testFiles.slice(0, 4) ?? []);
const hiddenTestCount = computed(() =>
  Math.max(0, (props.suggestion?.testFiles.length ?? 0) - visibleTests.value.length),
);
</script>

<template>
  <aside class="test-intelligence" aria-label="Recomendação de testes">
    <div class="test-intelligence-heading">
      <span>Test Intelligence</span>
      <strong v-if="suggestion">
        {{
          suggestion.recommendation === 'targeted'
            ? 'Testes direcionados encontrados'
            : 'Suíte completa recomendada'
        }}
      </strong>
      <strong v-else>Recomendação conservadora</strong>
    </div>

    <p v-if="loading && !suggestion" class="test-intelligence-note">
      Cruzando arquivos alterados com testes conhecidos…
    </p>
    <p v-else-if="errorMessage" class="test-intelligence-note">
      Não foi possível calcular a sugestão. Execute a suíte completa para manter a cobertura segura.
    </p>

    <template v-else-if="suggestion">
      <p class="test-intelligence-note">
        <template v-if="suggestion.recommendation === 'targeted'">
          Todos os {{ suggestion.changedFiles.length }} arquivo(s) alterado(s) possuem mapeamento direto. A sugestão é informativa e não inicia testes automaticamente.
        </template>
        <template v-else>
          <template v-if="suggestion.unmappedFiles.length > 0">
            {{ suggestion.unmappedFiles.length }} arquivo(s) alterado(s) ficaram sem mapeamento direto.
          </template>
          <template v-else>
            Não há evidência suficiente para tratar um subconjunto como equivalente à suíte completa.
          </template>
        </template>
      </p>

      <ul v-if="visibleTests.length > 0" class="test-intelligence-tests">
        <li v-for="file in visibleTests" :key="file"><code>{{ file }}</code></li>
        <li v-if="hiddenTestCount > 0">+ {{ hiddenTestCount }} teste(s)</li>
      </ul>

      <small class="test-intelligence-context">
        {{ suggestion.baseBranch }} → {{ suggestion.currentBranch }} · estado {{ suggestion.state }}
      </small>
    </template>
  </aside>
</template>

<style scoped>
.test-intelligence {
  display: grid;
  gap: 6px;
  margin: 0 16px var(--space-3);
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.test-intelligence-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.test-intelligence-heading span {
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.test-intelligence-heading strong {
  font-size: var(--font-xs);
}

.test-intelligence-note,
.test-intelligence-context {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.test-intelligence-tests {
  display: flex;
  flex-wrap: wrap;
  gap: 5px var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-muted);
  font-size: 10px;
}

.test-intelligence-tests code {
  overflow-wrap: anywhere;
}
</style>
