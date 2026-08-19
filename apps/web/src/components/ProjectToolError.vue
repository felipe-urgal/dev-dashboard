<script setup lang="ts">
function retry(): void {
  window.location.reload();
}
</script>

<template>
  <div class="project-tool-state project-tool-state-error" role="alert">
    <strong>Não foi possível carregar esta ferramenta.</strong>
    <p>O servidor não respondeu. Tente recarregar a ferramenta.</p>
    <button type="button" @click="retry">Tentar novamente</button>
  </div>
</template>

<style scoped>
.project-tool-state {
  display: grid;
  min-height: 180px;
  place-items: center;
  align-content: center;
  gap: 8px;
  border: 1px solid var(--danger-text);
  background: var(--danger-surface);
  color: var(--danger-text);
  font-size: 12px;
  text-align: center;
}

.project-tool-state p {
  margin: 0;
}

.project-tool-state button {
  border: 1px solid currentColor;
  border-radius: 7px;
  padding: 7px 10px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.project-tool-state button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
