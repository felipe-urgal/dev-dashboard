<script setup lang="ts">
import type { Project } from '@dev-dashboard/contracts';

import ProjectTestsPtyPanel from './ProjectTestsPtyPanel.vue';

defineProps<{
  project: Project;
  environmentInstanceId?: string | undefined;
}>();
</script>

<template>
  <ProjectTestsPtyPanel
    :project="project"
    :environment-instance-id="environmentInstanceId"
  />
</template>
