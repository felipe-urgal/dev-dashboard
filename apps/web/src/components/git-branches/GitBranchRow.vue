<script setup lang="ts">
import { computed } from 'vue';
import { NDropdown } from 'naive-ui';
import {
  EllipsisHorizontalIcon,
  LockClosedIcon,
} from '@heroicons/vue/24/outline';

import {
  menuActionsOf,
  primaryActionOf,
  publicationOf,
  trackingBadge,
  type BranchMenuAction,
  type BranchRow,
} from '../../utils/git-branches';
import { formatRelativeTime } from '../../utils/relative-time';
import { dangerMenuLabel } from '../../utils/ui-menu';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

const props = defineProps<{
  row: BranchRow;
  isProtected: boolean;
  /** Operação em andamento nesta branch (para trocar o rótulo do botão). */
  operationKind?: string | undefined;
  disabled: boolean;
}>();

const emit = defineEmits<{
  switch: [];
  publish: [];
  track: [];
  'open-pull-request': [];
  'menu-select': [action: BranchMenuAction];
}>();

const commit = computed(
  () => props.row.local?.latestCommit ?? props.row.origin?.latestCommit,
);
const isCurrent = computed(() => Boolean(props.row.local?.current));
const publication = computed(() => publicationOf(props.row));
const tracking = computed(() => trackingBadge(props.row));
const primary = computed(() => primaryActionOf(props.row));

/** O upstream da local aponta para outro nome que não origin/<mesmo nome>. */
const trackedElsewhere = computed(() => {
  const upstream = props.row.local?.upstream;
  return upstream && props.row.origin && upstream !== `origin/${props.row.name}`
    ? upstream
    : '';
});

const publicationBadge = computed(
  () =>
    ({
      published: { label: 'Publicada', tone: 'success' },
      unpublished: { label: 'Não publicada', tone: 'warning' },
      'remote-only': { label: 'Somente remota', tone: 'neutral' },
    })[publication.value] as {
      label: string;
      tone: 'success' | 'warning' | 'neutral';
    },
);

const primaryLabel = computed(() => {
  const busy = props.operationKind;
  switch (primary.value) {
    case 'switch':
      return busy === 'switch' ? 'Trocando…' : 'Trocar';
    case 'publish':
      return busy === 'publish' ? 'Publicando…' : 'Publicar';
    case 'track':
      return busy === 'track' ? 'Trazendo…' : 'Trazer para local';
    default:
      return '';
  }
});

const menuOptions = computed(() =>
  menuActionsOf(props.row, props.isProtected).map((action) => ({
    key: action.key,
    label: action.danger ? dangerMenuLabel(action.label) : action.label,
  })),
);

function runPrimary(): void {
  if (primary.value === 'switch') emit('switch');
  else if (primary.value === 'publish') emit('publish');
  else if (primary.value === 'track') emit('track');
}
</script>

<template>
  <div
    class="git-branch-row"
    :data-branch="row.name"
    :data-current="isCurrent || undefined"
  >
    <div class="git-branch-info">
      <div class="git-branch-name">
        <strong>{{ row.name }}</strong>
        <UiTag v-if="isCurrent" tone="accent">Atual</UiTag>
        <UiTag v-if="isProtected" title="Branch protegida">
          <LockClosedIcon class="git-branch-lock" aria-hidden="true" />
          protegida
        </UiTag>
        <UiTag :tone="publicationBadge.tone">{{
          publicationBadge.label
        }}</UiTag>
        <UiTag v-if="tracking" :tone="tracking.tone">{{
          tracking.label
        }}</UiTag>
      </div>
      <div class="git-branch-commit">
        <template v-if="commit">
          <code>{{ commit.shortHash }}</code>
          <span class="git-branch-subject" :title="commit.subject">{{
            commit.subject
          }}</span>
          <span>
            · {{ formatRelativeTime(commit.authoredAt) }}
            <template v-if="commit.authorName">
              · {{ commit.authorName }}</template
            >
          </span>
        </template>
        <span v-else>Sem commit disponível</span>
        <span v-if="trackedElsewhere" class="git-branch-tracking">
          acompanha {{ trackedElsewhere }}
        </span>
      </div>
    </div>

    <UiButton
      v-if="isCurrent"
      :disabled="disabled"
      @click="emit('open-pull-request')"
    >
      Abrir Pull Request
    </UiButton>
    <UiButton v-else-if="primary" :disabled="disabled" @click="runPrimary">
      {{ primaryLabel }}
    </UiButton>

    <NDropdown
      v-if="menuOptions.length > 0"
      trigger="click"
      placement="bottom-end"
      :options="menuOptions"
      :disabled="disabled"
      @select="(key: BranchMenuAction) => emit('menu-select', key)"
    >
      <UiButton
        icon
        variant="ghost"
        :disabled="disabled"
        :aria-label="`Mais ações para ${row.name}`"
        aria-haspopup="menu"
      >
        <EllipsisHorizontalIcon aria-hidden="true" />
      </UiButton>
    </NDropdown>
  </div>
</template>

<style scoped>
.git-branch-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.git-branch-row:first-child {
  border-top: 0;
}

.git-branch-row[data-current] {
  background: var(--accent-soft);
}

.git-branch-info {
  min-width: 0;
  flex: 1;
}

.git-branch-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.git-branch-name strong {
  font-weight: 650;
}

.git-branch-lock {
  width: 12px;
  height: 12px;
}

.git-branch-commit {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  color: var(--text-dim);
  font-size: 12.5px;
}

.git-branch-commit code {
  color: var(--text-muted);
  font-family: var(--font-family-mono);
}

.git-branch-tracking {
  margin-left: auto;
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.git-branch-subject {
  max-width: 520px;
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
