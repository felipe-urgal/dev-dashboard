<script setup lang="ts">
import type { Project } from '@dev-dashboard/contracts';

import ProjectTestsGuidedPanel from './ProjectTestsGuidedPanel.vue';

defineProps<{ project: Project }>();
</script>

<template>
  <ProjectTestsGuidedPanel :project="project" />
</template>
