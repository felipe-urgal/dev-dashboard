<script setup lang="ts">
import { PlayIcon } from '@heroicons/vue/24/outline';

import type { ProjectScript } from '@dev-dashboard/contracts';

import {
  projectScriptOriginLabels,
  projectScriptRiskLabels,
} from '../composables/useProjectScriptsPanel';
import { riskToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

defineProps<{
  item: ProjectScript;
  selected: boolean;
  disabled: boolean;
  starting: boolean;
}>();

defineEmits<{
  select: [];
  run: [];
}>();
</script>

<template>
  <article
    class="script-card"
    :class="{ active: selected }"
    @click="$emit('select')"
  >
    <header>
      <div>
        <span>{{ projectScriptOriginLabels[item.origin] }}</span>
        <h4>{{ item.name }}</h4>
      </div>
      <StatusBadge :tone="riskToneFor(item.risk)">
        {{ projectScriptRiskLabels[item.risk] }}
      </StatusBadge>
    </header>
    <p>{{ item.description }}</p>
    <code>{{ item.command }}</code>
    <footer>
      <small v-if="!item.enabled"> Ação destrutiva bloqueada </small>
      <button
        type="button"
        :disabled="!item.enabled || disabled"
        @click.stop="$emit('run')"
      >
        <PlayIcon aria-hidden="true" />
        {{
          starting
            ? 'Iniciando…'
            : item.variables?.length
              ? 'Preencher'
              : 'Executar'
        }}
      </button>
    </footer>
  </article>
</template>
