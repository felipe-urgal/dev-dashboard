<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowLongRightIcon,
  ArrowPathIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/outline';

import {
  formatRelativeTime,
  type FlowNode,
  type SyncTone,
} from '../../utils/git-sync-status';
import UiButton from '../ui/UiButton.vue';

defineProps<{
  nodes: FlowNode[];
  summaryTitle: string;
  summaryNote: string;
  tone: SyncTone;
  canSync: boolean;
  syncing: boolean;
  branchName: string;
  /** "upstream e origin" ou só "origin", conforme os remotos existentes. */
  fetchWhat: string;
}>();

const emit = defineEmits<{ synchronize: [] }>();

const howOpen = ref(false);
const how = ref<HTMLElement | null>(null);

function closeOnOutsideClick(event: MouseEvent): void {
  if (how.value && !how.value.contains(event.target as Node)) {
    howOpen.value = false;
  }
}

onMounted(() => window.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => window.removeEventListener('click', closeOnOutsideClick));
</script>

<template>
  <section class="git-flow" aria-label="Fluxo de sincronização">
    <template v-for="(node, index) in nodes" :key="node.id">
      <div class="git-flow-node" :data-id="node.id">
        <div class="git-flow-node-name">
          <strong>{{ node.name }}</strong>
          <small>{{ node.sub }}</small>
          <span
            v-if="node.badge"
            class="git-flow-badge"
            :data-tone="node.tone"
            >{{ node.badge }}</span
          >
        </div>
        <template v-if="node.commit">
          <code>{{ node.commit.shortHash }}</code>
          <p :title="node.commit.subject">{{ node.commit.subject }}</p>
          <small>
            {{ formatRelativeTime(node.commit.authoredAt) }}
            <template v-if="node.commit.authorName">
              · {{ node.commit.authorName }}
            </template>
          </small>
        </template>
        <small v-else>Sem commits</small>
      </div>

      <span
        v-if="index < nodes.length - 1"
        class="git-flow-arrow"
        :data-tone="tone"
        aria-hidden="true"
      >
        <ArrowLongRightIcon />
      </span>
    </template>

    <div class="git-flow-summary">
      <div role="status">
        <strong>{{ summaryTitle }}</strong>
        <small v-if="summaryNote">{{ summaryNote }}</small>
      </div>

      <span class="git-flow-spacer" />

      <span ref="how" class="git-flow-how">
        <UiButton
          icon
          variant="ghost"
          aria-label="Como funciona"
          title="Como funciona"
          :aria-expanded="howOpen"
          @click="howOpen = !howOpen"
        >
          <InformationCircleIcon aria-hidden="true" />
        </UiButton>
        <div v-if="howOpen" class="git-flow-popover">
          <strong>Como funciona</strong>
          <p>
            Busca {{ fetchWhat }}, integra na <code>main</code> por
            <code>merge</code> (se falhar, o merge é abortado e a main volta ao
            estado anterior), envia para o origin e retorna para
            <code>{{ branchName }}</code
            >. Exige árvore de trabalho limpa.
          </p>
        </div>
      </span>

      <UiButton
        variant="primary"
        :busy="syncing"
        :disabled="!canSync"
        @click="emit('synchronize')"
      >
        <ArrowPathIcon v-if="!syncing" aria-hidden="true" />
        {{ syncing ? 'Sincronizando…' : 'Sincronizar' }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.git-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-flow-node {
  display: flex;
  min-width: 230px;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-0);
}

.git-flow-node[data-id='main'] {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
}

.git-flow-node-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.git-flow-node-name small,
.git-flow-node > small {
  color: var(--text-dim);
  font-size: 12px;
}

.git-flow-node code {
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}

.git-flow-node p {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-flow-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 11.5px;
  font-weight: 650;
}

.git-flow-badge[data-tone='ok'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 18%, transparent);
}

.git-flow-badge[data-tone='warn'] {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 18%, transparent);
}

.git-flow-badge[data-tone='acc'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-flow-arrow {
  display: grid;
  width: 64px;
  place-items: center;
  color: var(--border-strong);
}

.git-flow-arrow svg {
  width: 32px;
  height: 20px;
}

.git-flow-arrow[data-tone='success'] {
  color: var(--success-text);
}

.git-flow-arrow[data-tone='warning'] {
  color: var(--warning-text);
}

.git-flow-arrow[data-tone='pending'],
.git-flow-arrow[data-tone='loading'] {
  color: var(--accent);
}

.git-flow-summary {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.git-flow-summary strong {
  font-size: 14px;
}

.git-flow-summary small {
  display: block;
  margin-top: 2px;
  color: var(--text-dim);
  font-size: 12.5px;
}

.git-flow-spacer {
  flex: 1 1 0;
}

.git-flow-how {
  position: relative;
}

.git-flow-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  right: 0;
  width: 340px;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--surface-1);
  box-shadow: 0 16px 40px rgb(0 0 0 / 40%);
  font-size: 13px;
  line-height: 1.55;
}

.git-flow-popover p {
  margin: 4px 0 0;
}

.git-flow-popover code {
  font-family: var(--font-family-mono);
}
</style>
