<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <div v-if="icon || $slots.icon" class="empty-icon" aria-hidden="true">
      <slot name="icon">{{ icon }}</slot>
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot name="actions" />
  </div>
</template>
