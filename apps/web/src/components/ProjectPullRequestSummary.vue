<script setup lang="ts">
import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  ref,
  watch,
} from 'vue';

import type {
  GitOpenPullRequest,
  GitPullRequestCiStatus,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  getProjectGitPullRequestSummary,
  type GitPullRequestTargetRemote,
} from '../api';
import { fetchProjectGitWorkspace } from '../api/git-workspace';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
}>();

const pullRequest = ref<GitOpenPullRequest | null>(null);
let generation = 0;

const providerLabel = computed(() =>
  pullRequest.value?.provider === 'gitlab' ? 'GitLab' : 'GitHub',
);

const commentsLabel = computed(() => {
  const count = pullRequest.value?.commentsCount ?? 0;
  return `${count} ${count === 1 ? 'comentário' : 'comentários'}`;
});

const unresolvedLabel = computed(() => {
  const count = pullRequest.value?.unresolvedConversationsCount ?? 0;
  return `${count} ${count === 1 ? 'não resolvido' : 'não resolvidos'}`;
});

function targetRemoteFor(
  workspace: ProjectGitWorkspace,
): GitPullRequestTargetRemote | null {
  if (workspace.remotes.some((remote) => remote.name === 'upstream')) {
    return 'upstream';
  }
  if (workspace.remotes.some((remote) => remote.name === 'origin')) {
    return 'origin';
  }
  return null;
}

function baseBranchFor(
  workspace: ProjectGitWorkspace,
  targetRemote: GitPullRequestTargetRemote,
  currentBranch: string,
): string {
  const branches = Array.from(new Set(
    workspace.branches
      .filter((branch) =>
        branch.kind === 'remote'
        && branch.remote === targetRemote
        && branch.shortName !== currentBranch,
      )
      .map((branch) => branch.shortName),
  ));

  return branches.find((branch) => branch === 'main')
    ?? branches.find((branch) => branch === 'master')
    ?? branches.find((branch) => branch === 'develop')
    ?? branches.sort((left, right) => left.localeCompare(right))[0]
    ?? 'main';
}

function ciLabel(status: GitPullRequestCiStatus): string {
  if (status === 'success') return 'CI passou';
  if (status === 'pending') return 'CI rodando';
  if (status === 'failure') return 'CI falhou';
  return 'CI indisponível';
}

async function loadSummary(): Promise<void> {
  const requestGeneration = ++generation;
  pullRequest.value = null;

  if (
    !props.overview.repository
    || props.overview.detached
    || !props.overview.branch
    || !props.overview.upstream
  ) {
    return;
  }

  try {
    const workspace = await fetchProjectGitWorkspace(props.projectId);
    if (requestGeneration !== generation) return;

    const targetRemote = targetRemoteFor(workspace);
    if (!targetRemote) return;

    const lookup = await getProjectGitPullRequestSummary(
      props.projectId,
      {
        targetRemote,
        baseBranch: baseBranchFor(
          workspace,
          targetRemote,
          props.overview.branch,
        ),
      },
    );
    if (requestGeneration !== generation) return;
    pullRequest.value = lookup.existing ?? null;
  } catch {
    if (requestGeneration === generation) pullRequest.value = null;
  }
}

watch(
  () => [
    props.projectId,
    props.overview.branch,
    props.overview.upstream,
  ] as const,
  () => {
    void loadSummary();
  },
  { immediate: true },
);
</script>

<template>
  <aside
    v-if="pullRequest"
    class="project-pr-summary"
    aria-label="Status da Pull Request"
  >
    <div class="project-pr-statuses">
      <span class="project-pr-chip project-pr-chip-open">
        <CheckCircleIcon aria-hidden="true" />
        PR #{{ pullRequest.number }} aberta
      </span>

      <span
        v-if="pullRequest.ciStatus && pullRequest.ciStatus !== 'unknown'"
        class="project-pr-chip"
        :class="`project-pr-chip-ci-${pullRequest.ciStatus}`"
      >
        <CheckCircleIcon
          v-if="pullRequest.ciStatus === 'success'"
          aria-hidden="true"
        />
        <ClockIcon
          v-else-if="pullRequest.ciStatus === 'pending'"
          aria-hidden="true"
        />
        <ExclamationCircleIcon v-else aria-hidden="true" />
        {{ ciLabel(pullRequest.ciStatus) }}
      </span>

      <span
        v-if="(pullRequest.commentsCount ?? 0) > 0"
        class="project-pr-chip project-pr-chip-comments"
      >
        <ChatBubbleLeftRightIcon aria-hidden="true" />
        {{ commentsLabel }}
      </span>

      <span
        v-if="(pullRequest.unresolvedConversationsCount ?? 0) > 0"
        class="project-pr-chip project-pr-chip-unresolved"
      >
        <ExclamationCircleIcon aria-hidden="true" />
        {{ unresolvedLabel }}
      </span>
    </div>

    <a
      class="project-pr-provider-link"
      :href="pullRequest.url"
      target="_blank"
      rel="noopener noreferrer"
    >
      Ver no {{ providerLabel }}
      <ArrowTopRightOnSquareIcon aria-hidden="true" />
    </a>
  </aside>
</template>

<style scoped>
.project-pr-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-left: auto;
}

.project-pr-statuses {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.project-pr-chip {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.project-pr-chip svg,
.project-pr-provider-link svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.project-pr-chip-open,
.project-pr-chip-ci-success {
  border-color: color-mix(in srgb, #15803d 28%, var(--border));
  color: #166534;
  background: color-mix(in srgb, #dcfce7 72%, var(--surface-1));
}

.project-pr-chip-ci-pending,
.project-pr-chip-unresolved {
  border-color: color-mix(in srgb, #d97706 30%, var(--border));
  color: #b45309;
  background: color-mix(in srgb, #ffedd5 72%, var(--surface-1));
}

.project-pr-chip-ci-failure {
  border-color: color-mix(in srgb, #dc2626 28%, var(--border));
  color: #b91c1c;
  background: color-mix(in srgb, #fee2e2 72%, var(--surface-1));
}

.project-pr-chip-comments {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  color: var(--accent);
  background: var(--accent-soft);
}

.project-pr-provider-link {
  display: inline-flex;
  min-height: 34px;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-decoration: none;
  white-space: nowrap;
}

.project-pr-provider-link:hover {
  text-decoration: underline;
}

@media (max-width: 1180px) {
  .project-pr-summary {
    width: 100%;
    margin-left: 0;
    justify-content: space-between;
  }

  .project-pr-statuses {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .project-pr-summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
