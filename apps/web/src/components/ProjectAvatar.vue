<script setup lang="ts">
import { ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import { projectFaviconUrl } from '../api';
import { projectInitials } from '../utils/project-labels';

const props = defineProps<{
  project: Project;
}>();

const imageFailed = ref(false);

watch(
  () => props.project.id,
  () => {
    imageFailed.value = false;
  },
);
</script>

<template>
  <div class="project-avatar">
    <img
      v-if="!imageFailed"
      class="project-avatar-image"
      :src="projectFaviconUrl(project.id)"
      alt=""
      loading="lazy"
      @error="imageFailed = true"
    />

    <span v-else>
      {{ projectInitials(project.name) }}
    </span>
  </div>
</template>
