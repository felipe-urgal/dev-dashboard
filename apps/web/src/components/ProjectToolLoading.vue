<template>
  <div class="project-tool-state project-tool-state-loading" aria-busy="true">
    <span class="project-tool-state-spinner" aria-hidden="true" />
    <p role="status" aria-live="polite">Carregando ferramenta…</p>
  </div>
</template>

<style scoped>
.project-tool-state {
  display: grid;
  min-height: 180px;
  place-items: center;
  align-content: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-muted);
  font-size: 12px;
}

.project-tool-state p {
  margin: 0;
}

.project-tool-state-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 999px;
  animation: project-tool-spin 800ms linear infinite;
}

@keyframes project-tool-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-tool-state-spinner {
    animation: none;
  }
}
</style>
