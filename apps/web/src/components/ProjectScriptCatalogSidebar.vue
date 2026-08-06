<script setup lang="ts">
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  CommandLineIcon,
  QueueListIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/vue/24/outline';

import type { ProjectScriptRisk } from '@dev-dashboard/contracts';

import {
  projectScriptCategoryIds,
  projectScriptCategoryLabels,
  type ScriptCategory,
} from '../composables/useProjectScriptsPanel';

defineProps<{
  category: ScriptCategory;
  categoryCounts: Record<ScriptCategory, number>;
  riskCounts: Record<ProjectScriptRisk, number>;
}>();

defineEmits<{
  select: [category: ScriptCategory];
}>();

function categoryIcon(categoryId: ScriptCategory) {
  if (categoryId === 'build') return BoltIcon;
  if (categoryId === 'development') return CommandLineIcon;
  if (categoryId === 'tests') return CheckCircleIcon;
  if (categoryId === 'maintenance') return WrenchScrewdriverIcon;
  if (categoryId === 'deploy') return ArrowPathIcon;
  return QueueListIcon;
}
</script>

<template>
  <aside class="scripts-catalog-sidebar">
    <section>
      <header><h4>Categorias</h4></header>
      <nav aria-label="Categorias de scripts">
        <button
          v-for="categoryId in projectScriptCategoryIds"
          :key="categoryId"
          type="button"
          :class="{ active: category === categoryId }"
          @click="$emit('select', categoryId)"
        >
          <component :is="categoryIcon(categoryId)" aria-hidden="true" />
          <span>{{ projectScriptCategoryLabels[categoryId] }}</span>
          <strong>{{ categoryCounts[categoryId] }}</strong>
        </button>
      </nav>
    </section>

    <section class="scripts-risk-summary">
      <header><h4>Risco nesta página</h4></header>
      <dl>
        <div>
          <dt><span class="is-safe"></span>Somente leitura</dt>
          <dd>{{ riskCounts['read-only'] }}</dd>
        </div>
        <div>
          <dt><span class="is-warning"></span>Mutáveis</dt>
          <dd>{{ riskCounts.mutable }}</dd>
        </div>
        <div>
          <dt><span class="is-danger"></span>Destrutivos</dt>
          <dd>{{ riskCounts.destructive }}</dd>
        </div>
      </dl>
    </section>
  </aside>
</template>
