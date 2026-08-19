<template>
  <div class="project-tool-state project-tool-state-error" role="alert">
    <strong>Não foi possível carregar esta ferramenta.</strong>
    <p>Recarregue a página e tente novamente.</p>
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
</style>
