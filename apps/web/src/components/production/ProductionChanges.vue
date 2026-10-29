<script setup lang="ts">
import { computed } from 'vue';

import type { DeploymentPendingChanges } from '@dev-dashboard/contracts';

import UiTag from '../ui/UiTag.vue';

const props = defineProps<{
  changes: DeploymentPendingChanges | null;
  loading: boolean;
  /** Há uma revisão de produção conhecida para comparar. */
  comparable: boolean;
  branch: string;
}>();

const available = computed(() =>
  props.changes?.state === 'available' ? props.changes : null,
);

const headline = computed(() => {
  if (props.loading) return 'Comparando com a produção…';
  const data = available.value;
  if (!data) return 'Pronto para publicar';
  if (data.total === 0) return 'Produção está em dia';
  return data.total === 1
    ? '1 commit novo desde a produção'
    : `${data.total} commits novos desde a produção`;
});

const unavailableNote = computed(() => {
  if (!props.comparable)
    return 'A revisão em produção ainda não é conhecida, então não dá para listar o que mudou. Atualize o status.';
  if (props.changes?.reason === 'revision-not-found')
    return 'A revisão em produção não existe neste clone. Faça um fetch para ver o que mudou.';
  if (props.changes?.reason === 'branch-not-found')
    return `A branch ${props.branch} não foi encontrada neste clone.`;
  return 'Não foi possível comparar com a produção.';
});

function relative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
</script>

<template>
  <section class="prod-changes" aria-label="O que vai subir">
    <header>
      <div>
        <span class="prod-eyebrow">Pronto para publicar</span>
        <h4>{{ headline }}</h4>
      </div>
      <div class="prod-changes-action">
        <slot name="action" />
      </div>
    </header>

    <p v-if="loading" class="prod-changes-note">Lendo o Git local…</p>

    <p v-else-if="!available" class="prod-changes-note">
      {{ unavailableNote }}
    </p>

    <template v-else-if="available.total > 0">
      <div class="prod-changes-chips">
        <UiTag>{{ available.files }} arquivos</UiTag>
        <UiTag v-if="available.migrations > 0" tone="warning">
          {{ available.migrations }}
          {{ available.migrations === 1 ? 'migration' : 'migrations' }}
        </UiTag>
        <UiTag tone="accent">origin/{{ available.branch }}</UiTag>
      </div>

      <ul class="prod-changes-commits">
        <li v-for="commit in available.commits" :key="commit.hash">
          <code>{{ commit.shortHash }}</code>
          <span class="prod-changes-subject" :title="commit.subject">{{
            commit.subject
          }}</span>
          <small
            >{{ commit.authorName }} · {{ relative(commit.authoredAt) }}</small
          >
        </li>
      </ul>
      <p
        v-if="available.total > available.commits.length"
        class="prod-changes-more"
      >
        e mais {{ available.total - available.commits.length }} commits
        anteriores
      </p>
    </template>

    <p v-else class="prod-changes-note">
      A revisão em produção coincide com origin/{{ available.branch }}.
    </p>
  </section>
</template>

<style scoped>
.prod-changes {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-changes header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.prod-eyebrow {
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prod-changes h4 {
  margin: 2px 0 0;
  font-size: 15px;
}

.prod-changes-action {
  display: flex;
  gap: 8px;
}

.prod-changes-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.prod-changes-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prod-changes-commits {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  list-style: none;
}

.prod-changes-commits li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}

.prod-changes-commits li:first-child {
  border-top: 0;
}

.prod-changes-commits code {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.prod-changes-subject {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prod-changes-commits small {
  flex: 0 0 auto;
  color: var(--text-dim);
  font-size: 12px;
}

.prod-changes-more {
  margin: 0;
  color: var(--text-dim);
  font-size: 12.5px;
}
</style>
