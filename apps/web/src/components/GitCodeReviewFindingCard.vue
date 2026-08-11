<script setup lang="ts">
import {
  CheckIcon,
  CheckCircleIcon,
  MinusCircleIcon,
} from '@heroicons/vue/24/outline';

import type { GitPullRequestReviewFinding } from '@dev-dashboard/contracts';

import { findingSeverityLabel } from '../utils/git-review-findings';

defineProps<{
  finding: GitPullRequestReviewFinding;
  resolved: boolean;
  selected: boolean;
}>();

defineEmits<{
  'toggle-selection': [];
  resolve: [];
  ignore: [];
}>();
</script>

<template>
  <article
    :class="[
      'git-code-review-finding',
      `is-${finding.severity}`,
      { 'is-resolved': resolved },
    ]"
  >
    <label :aria-label="`Selecionar ${finding.title}`">
      <input
        type="checkbox"
        :checked="selected"
        :disabled="resolved"
        @change="$emit('toggle-selection')"
      />
    </label>
    <div class="git-code-review-finding-copy">
      <span :class="['git-code-review-severity', `is-${finding.severity}`]">
        {{ findingSeverityLabel(finding) }}
      </span>
      <strong>{{ finding.title }}</strong>
      <small>Linha {{ finding.line ?? 'não identificada' }}</small>
      <p>{{ finding.explanation }}</p>
      <p class="git-code-review-recommendation">
        {{ finding.recommendation }}
      </p>
    </div>
    <div class="git-code-review-finding-actions">
      <button v-if="!resolved" type="button" @click="$emit('resolve')">
        <CheckIcon aria-hidden="true" />
        Resolver
      </button>
      <span v-else class="git-code-review-resolved">
        <CheckCircleIcon aria-hidden="true" /> Resolvido
      </span>
      <button v-if="!resolved" type="button" @click="$emit('ignore')">
        <MinusCircleIcon aria-hidden="true" />
        Ignorar
      </button>
    </div>
  </article>
</template>

<style scoped src="./GitCodeReviewFindingCard.css"></style>
