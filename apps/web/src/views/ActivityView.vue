<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  QueueListIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type {
  ActivityEvent,
  ActivityEventStatus,
  ActivityJob,
  ActivityJobStatus,
  ActivitySnapshot,
  Project,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  fetchActivity,
  fetchProjectActivity,
  fetchProjects,
} from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import StatusBadge from '../components/StatusBadge.vue';
import type { StatusBadgeTone } from '../components/status-badge-types';
import { formatDuration } from '../utils/process-format';

const projects = ref<Project[]>([]);
const snapshot = ref<ActivitySnapshot | null>(null);
const projectFilter = ref('');
const loading = ref(false);
const projectsErrorMessage = ref('');
const errorMessage = ref('');
const now = ref(Date.now());

let controller: AbortController | undefined;
let clockInterval: ReturnType<typeof setInterval> | undefined;

const projectNameById = computed(() => {
  const names = new Map<string, string>();
  for (const project of projects.value) names.set(project.id, project.name);
  return names;
});

const jobs = computed(() => snapshot.value?.jobs ?? []);
const events = computed(() => snapshot.value?.events ?? []);
const partial = computed(() => snapshot.value?.partial ?? false);
const unavailableDomains = computed(
  () => snapshot.value?.unavailableDomains ?? [],
);

function projectName(projectId: string): string {
  return projectNameById.value.get(projectId) ?? projectId;
}

function domainLabel(domain: ActivityEvent['domain']): string {
  const labels: Record<ActivityEvent['domain'], string> = {
    process: 'Processo',
    test: 'Testes',
    script: 'Script',
    git: 'Git',
    database: 'Banco',
    compose: 'Compose',
    deployment: 'Deploy',
    ci: 'CI',
    security: 'Segurança',
  };
  return labels[domain];
}

function eventStatusLabel(status: ActivityEventStatus | undefined): string {
  if (!status) return 'Registrado';
  const labels: Record<ActivityEventStatus, string> = {
    started: 'Iniciado',
    succeeded: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    warning: 'Atenção',
  };
  return labels[status];
}

function jobStatusLabel(status: ActivityJobStatus): string {
  const labels: Record<ActivityJobStatus, string> = {
    queued: 'Na fila',
    running: 'Em execução',
    succeeded: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  };
  return labels[status];
}

function statusTone(
  status: ActivityEventStatus | ActivityJobStatus | undefined,
): StatusBadgeTone {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'started':
    case 'queued':
    case 'running':
      return 'info';
    case 'cancelled':
    default:
      return 'neutral';
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function environmentQuery(
  environmentInstanceId: string | undefined,
): Record<string, string> | undefined {
  return environmentInstanceId
    ? { environmentInstanceId }
    : undefined;
}

function detailTarget(
  item: ActivityEvent | ActivityJob,
): RouteLocationRaw | undefined {
  const projectId = item.projectId;
  const resourceKind = item.resourceRef?.kind;

  if (resourceKind === 'managed-process') {
    return { name: 'processes', query: { project: projectId } };
  }
  if (resourceKind === 'test-execution') {
    return {
      name: 'project-tests',
      params: { projectId },
      ...(environmentQuery(item.environmentInstanceId)
        ? { query: environmentQuery(item.environmentInstanceId) }
        : {}),
    };
  }
  if (resourceKind === 'git-mutation') {
    return { name: 'project-git', params: { projectId } };
  }

  switch (item.domain) {
    case 'process':
      return { name: 'processes', query: { project: projectId } };
    case 'test':
      return {
        name: 'project-tests',
        params: { projectId },
        ...(environmentQuery(item.environmentInstanceId)
          ? { query: environmentQuery(item.environmentInstanceId) }
          : {}),
      };
    case 'git':
      return { name: 'project-git', params: { projectId } };
    case 'database':
      return { name: 'database' };
    case 'deployment':
      return { name: 'project-production', params: { projectId } };
    case 'security':
      return { name: 'project-security-center', params: { projectId } };
    default:
      return undefined;
  }
}

function syncClock(): void {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = undefined;
  }
  if (jobs.value.length === 0) return;
  clockInterval = setInterval(() => {
    now.value = Date.now();
  }, 1_000);
}

async function loadProjects(): Promise<void> {
  try {
    projects.value = await fetchProjects();
    projectsErrorMessage.value = '';
  } catch (error) {
    projectsErrorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar a lista de projetos.';
  }
}

async function loadActivity(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const activeController = controller;
  loading.value = true;
  errorMessage.value = '';

  try {
    snapshot.value = projectFilter.value
      ? await fetchProjectActivity(
          projectFilter.value,
          100,
          activeController.signal,
        )
      : await fetchActivity(100, activeController.signal);
    now.value = Date.now();
    syncClock();
  } catch (error) {
    if (activeController.signal.aborted) return;
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar a atividade.';
  } finally {
    if (controller === activeController) loading.value = false;
  }
}

watch(projectFilter, () => {
  void loadActivity();
});

onMounted(() => {
  void Promise.all([loadProjects(), loadActivity()]);
});

onBeforeUnmount(() => {
  controller?.abort();
  if (clockInterval) clearInterval(clockInterval);
});
</script>

<template>
  <section
    id="activity"
    class="content activity-page"
    :aria-busy="loading"
    aria-label="Atividade e jobs"
  >
    <header class="activity-page-header">
      <div>
        <span class="activity-page-kicker">Operação local</span>
        <h1>Atividade</h1>
        <p>Veja o que aconteceu recentemente e o que ainda está rodando.</p>
      </div>

      <div class="activity-page-actions">
        <label class="activity-project-filter">
          <span>Projeto</span>
          <select id="activity-project-filter" v-model="projectFilter">
            <option value="">Todos os projetos</option>
            <option
              v-for="project in projects"
              :key="project.id"
              :value="project.id"
            >
              {{ project.name }}
            </option>
          </select>
        </label>

        <button
          type="button"
          class="activity-refresh-button"
          :disabled="loading"
          @click="loadActivity"
        >
          <ArrowPathIcon
            aria-hidden="true"
            :class="{ 'activity-refresh-icon-active': loading }"
          />
          {{ loading ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <p v-if="projectsErrorMessage" class="activity-page-note" role="status">
      {{ projectsErrorMessage }}
    </p>

    <p v-if="errorMessage" class="activity-page-error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadActivity">Tentar novamente</button>
    </p>

    <div
      v-if="partial && !errorMessage"
      class="activity-partial-warning"
      role="status"
    >
      Snapshot parcial: indisponível em
      {{ unavailableDomains.map(domainLabel).join(', ') }}.
    </div>

    <LoadingSkeleton
      v-if="loading && !snapshot"
      label="Carregando atividade…"
      :rows="5"
    />

    <template v-else-if="snapshot">
      <section class="activity-section" aria-labelledby="activity-jobs-title">
        <header class="activity-section-header">
          <div>
            <QueueListIcon aria-hidden="true" />
            <div>
              <h2 id="activity-jobs-title">Jobs ativos</h2>
              <p>Execuções em andamento, sem criar um segundo executor.</p>
            </div>
          </div>
          <span>{{ jobs.length }}</span>
        </header>

        <div v-if="jobs.length > 0" class="activity-jobs-grid">
          <article
            v-for="job in jobs"
            :key="job.id"
            class="activity-job-card"
          >
            <header>
              <div>
                <strong>{{ job.action }}</strong>
                <span>{{ projectName(job.projectId) }}</span>
              </div>
              <StatusBadge :tone="statusTone(job.status)">
                {{ jobStatusLabel(job.status) }}
              </StatusBadge>
            </header>

            <dl>
              <div>
                <dt>Domínio</dt>
                <dd>{{ domainLabel(job.domain) }}</dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{{ formatDuration(job.startedAt, now) }}</dd>
              </div>
              <div v-if="job.environmentInstanceId">
                <dt>Ambiente</dt>
                <dd :title="job.environmentInstanceId">
                  {{ job.environmentInstanceId }}
                </dd>
              </div>
            </dl>

            <footer v-if="detailTarget(job)">
              <RouterLink
                class="activity-detail-link"
                :to="detailTarget(job)!"
              >
                Abrir detalhes
                <ArrowTopRightOnSquareIcon aria-hidden="true" />
              </RouterLink>
            </footer>
          </article>
        </div>

        <p v-else class="activity-empty-state">
          Nenhum job ativo neste recorte.
        </p>
      </section>

      <section class="activity-section" aria-labelledby="activity-timeline-title">
        <header class="activity-section-header">
          <div>
            <ClockIcon aria-hidden="true" />
            <div>
              <h2 id="activity-timeline-title">Atividade recente</h2>
              <p>Resumo agregado; logs completos continuam no domínio original.</p>
            </div>
          </div>
          <span>{{ events.length }}</span>
        </header>

        <ol v-if="events.length > 0" class="activity-timeline">
          <li
            v-for="event in events"
            :key="event.id"
            class="activity-timeline-item"
          >
            <div class="activity-timeline-marker" aria-hidden="true"></div>
            <article>
              <header>
                <div>
                  <strong>{{ event.summary }}</strong>
                  <span>
                    {{ projectName(event.projectId) }} ·
                    {{ domainLabel(event.domain) }}
                  </span>
                </div>
                <StatusBadge :tone="statusTone(event.status)">
                  {{ eventStatusLabel(event.status) }}
                </StatusBadge>
              </header>

              <footer>
                <time :datetime="event.occurredAt">
                  {{ formatTimestamp(event.occurredAt) }}
                </time>
                <RouterLink
                  v-if="detailTarget(event)"
                  class="activity-detail-link"
                  :to="detailTarget(event)!"
                >
                  Abrir detalhes
                  <ArrowTopRightOnSquareIcon aria-hidden="true" />
                </RouterLink>
              </footer>
            </article>
          </li>
        </ol>

        <p v-else class="activity-empty-state">
          Nenhuma atividade recente neste recorte.
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.activity-page {
  display: grid;
  gap: 18px;
}

.activity-page-header,
.activity-section-header,
.activity-job-card header,
.activity-timeline-item article > header,
.activity-timeline-item article > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.activity-page-header {
  align-items: flex-end;
}

.activity-page-header h1,
.activity-section-header h2,
.activity-job-card strong,
.activity-timeline-item strong {
  margin: 0;
}

.activity-page-header p,
.activity-section-header p {
  margin: 4px 0 0;
  color: var(--text-muted);
}

.activity-page-kicker {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.activity-page-actions {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.activity-project-filter {
  display: grid;
  gap: 5px;
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.activity-project-filter select,
.activity-refresh-button {
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
}

.activity-project-filter select {
  min-width: 220px;
  padding: 0 10px;
}

.activity-refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  cursor: pointer;
}

.activity-refresh-button:disabled {
  cursor: default;
  opacity: 0.6;
}

.activity-refresh-button svg,
.activity-detail-link svg,
.activity-section-header svg {
  width: 16px;
  height: 16px;
}

.activity-refresh-icon-active {
  animation: activity-spin 0.8s linear infinite;
}

.activity-page-note,
.activity-page-error,
.activity-partial-warning,
.activity-empty-state {
  margin: 0;
  padding: 11px 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-muted);
}

.activity-page-error {
  color: var(--danger-text);
}

.activity-page-error button {
  margin-left: 8px;
}

.activity-partial-warning {
  color: var(--warning-text);
}

.activity-section {
  display: grid;
  gap: 12px;
}

.activity-section-header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.activity-section-header > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.activity-section-header > span {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.activity-jobs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 10px;
}

.activity-job-card,
.activity-timeline-item article {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.activity-job-card {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.activity-job-card header > div,
.activity-timeline-item article > header > div {
  display: grid;
  gap: 3px;
}

.activity-job-card header span,
.activity-timeline-item header span,
.activity-timeline-item time {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.activity-job-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.activity-job-card dl > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
}

.activity-job-card dt {
  color: var(--text-muted);
}

.activity-job-card dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-job-card footer {
  display: flex;
  justify-content: flex-end;
}

.activity-timeline {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-timeline-item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 8px;
}

.activity-timeline-marker {
  width: 8px;
  height: 8px;
  margin-top: 18px;
  border-radius: 999px;
  background: var(--accent);
}

.activity-timeline-item article {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
}

.activity-detail-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-decoration: none;
}

.activity-detail-link:hover,
.activity-detail-link:focus-visible {
  text-decoration: underline;
}

@keyframes activity-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .activity-page-header,
  .activity-page-actions,
  .activity-timeline-item article > header,
  .activity-timeline-item article > footer {
    align-items: stretch;
    flex-direction: column;
  }

  .activity-project-filter select {
    width: 100%;
    min-width: 0;
  }
}
</style>
