<script setup lang="ts">
defineProps<{
  path: string;
  baseContent: string;
  localContent: string;
  diskContent: string;
}>();

const emit = defineEmits<{
  'keep-local': [];
  'use-disk': [];
}>();
</script>

<template>
  <section class="editor-conflict" aria-labelledby="editor-conflict-title">
    <header>
      <div>
        <span>Conflito externo</span>
        <strong id="editor-conflict-title">{{ path }}</strong>
      </div>
      <p>Compare as três versões antes de decidir. Nada é sobrescrito automaticamente.</p>
    </header>

    <div class="editor-conflict-grid">
      <article>
        <h4>Base aberta</h4>
        <pre tabindex="0"><code>{{ baseContent }}</code></pre>
      </article>
      <article>
        <h4>Minha edição</h4>
        <pre tabindex="0"><code>{{ localContent }}</code></pre>
      </article>
      <article>
        <h4>Disco atual</h4>
        <pre tabindex="0"><code>{{ diskContent }}</code></pre>
      </article>
    </div>

    <footer>
      <button type="button" @click="emit('use-disk')">
        Usar versão do disco
      </button>
      <button type="button" class="button-primary" @click="emit('keep-local')">
        Manter minha edição
      </button>
    </footer>
  </section>
</template>

<style scoped>
.editor-conflict {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--warning-border, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.editor-conflict > header,
.editor-conflict > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-conflict header div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.editor-conflict header span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
  letter-spacing: .06em;
}

.editor-conflict header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-conflict header p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.editor-conflict-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.editor-conflict article {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.editor-conflict h4 {
  margin: 0;
  padding: 7px 9px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.editor-conflict pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  padding: 10px;
  font-family: var(--font-mono);
  font-size: var(--font-xs);
  line-height: 1.5;
  white-space: pre;
}

.editor-conflict footer {
  justify-content: flex-end;
}

.editor-conflict button {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  cursor: pointer;
}

.editor-conflict .button-primary {
  color: var(--button-primary-text, white);
  border-color: var(--accent);
  background: var(--accent);
}

@media (max-width: 980px) {
  .editor-conflict-grid {
    grid-template-columns: 1fr;
  }

  .editor-conflict > header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
