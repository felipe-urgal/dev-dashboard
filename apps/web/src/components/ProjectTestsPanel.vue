<script setup lang="ts">
import type { Project } from '@dev-dashboard/contracts';

import ProjectTestsPtyPanel from './ProjectTestsPtyPanel.vue';

defineProps<{ project: Project }>();
</script>

<template>
  <ProjectTestsPtyPanel :project="project" />
</template>
