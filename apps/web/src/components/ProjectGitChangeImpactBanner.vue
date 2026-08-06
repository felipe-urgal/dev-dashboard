<script setup lang="ts">
import { RouterLink } from 'vue-router';

import type { ProjectChangeImpact } from '@dev-dashboard/contracts';

defineProps<{
  projectId: string;
  impact: ProjectChangeImpact;
}>();
</script>

<template>
  <aside class="git-change-impact" aria-live="polite">
    <p class="git-change-impact-title">
      A mudança trouxe {{ impact.changedPaths.length }}
      {{
        impact.changedPaths.length === 1
          ? 'arquivo alterado'
          : 'arquivos alterados'
      }}. Recomendações:
    </p>
    <ul class="git-change-impact-list">
      <li v-for="action in impact.actions" :key="action.category">
        <div class="git-change-impact-copy">
          <strong>{{ action.label }}</strong>
          <p>{{ action.description }}</p>
        </div>
        <RouterLink
          v-if="action.routeName"
          class="git-change-impact-link"
          :to="{ name: action.routeName, params: { projectId } }"
        >
          Abrir
        </RouterLink>
      </li>
    </ul>
  </aside>
</template>

<style scoped src="./ProjectGitChangeImpactBanner.css"></style>
