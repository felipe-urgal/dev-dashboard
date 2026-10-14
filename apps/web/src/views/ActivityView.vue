<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  ArrowPathIcon,
  CpuChipIcon,
  PlayPauseIcon,
} from '@heroicons/vue/24/outline';

import type {
  ActivityEvent,
  ActivityJob,
  ActivitySnapshot,
} from '@dev-dashboard/contracts';

import { fetchActivity } from '../api/activity';
import EmptyState from '../components/EmptyState.vue';
import StatusBadge from '../components/StatusBadge.vue';
import type { StatusBadgeTone } from '../components/status-badge-types';
import { dashboardStore } from '../stores/dashboard';
import {
  resolveActivityResource,
  canCancelActivityJob,
  cancelActivityJob,
} from '../utils/activity-resources';

const snapshot = ref<ActivitySnapshot | null>(null);
const loading = ref(false);
const cancellingJobId = ref('');
const errorMessage = ref('');
const projectFilter = ref('');
const domainFilter = ref('');
const statusFilter = ref('');
const jobsProjectFilter = ref('');
const jobsDomainFilter = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let generation = 0;
let controller: AbortController | undefined;
const active = computed(() =>
  (snapshot.value?.jobs ?? []).some(
    (job) => job.status === 'running' || job.status === 'queued',
  ),
);
const projectChoices = computed(() =>
  [
    ...new Set([
      ...(snapshot.value?.jobs ?? []).map((x) => x.projectId),
      ...(snapshot.value?.events ?? []).map((x) => x.projectId),
    ]),
  ].sort(),
);
const domainChoices = computed(() =>
  [
    ...new Set([
      ...(snapshot.value?.jobs ?? []).map((x) => x.domain),
      ...(snapshot.value?.events ?? []).map((x) => x.domain),
    ]),
  ].sort(),
);
function visible(): boolean {
  return document.visibilityState === 'visible';
}
function stopTimer(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
function schedule(): void {
  stopTimer();
  if (disposed || !visible()) return;
  timer = setTimeout(
    () => {
      void load();
    },
    active.value ? 3000 : 30000,
  );
}
function visibilityChanged(): void {
  if (!visible()) {
    stopTimer();
    controller?.abort();
  } else void load();
}

const projectNameById = computed(
  () =>
    new Map(
      dashboardStore.knownProjects.value.map((project) => [
        project.id,
        project.name,
      ]),
    ),
);

const jobs = computed(() =>
  (snapshot.value?.jobs ?? []).filter(
    (x) =>
      (!jobsProjectFilter.value || x.projectId === jobsProjectFilter.value) &&
      (!jobsDomainFilter.value || x.domain === jobsDomainFilter.value),
  ),
);
const events = computed(() =>
  (snapshot.value?.events ?? []).filter(
    (x) =>
      (!projectFilter.value || x.projectId === projectFilter.value) &&
      (!domainFilter.value || x.domain === domainFilter.value) &&
      (!statusFilter.value || x.status === statusFilter.value),
  ),
);

function projectName(projectId: string): string {
  return projectNameById.value.get(projectId) ?? projectId;
}

function jobTone(job: ActivityJob): StatusBadgeTone {
  if (job.status === 'running') return 'info';
  if (job.status === 'queued') return 'warning';
  if (job.status === 'failed') return 'danger';
  if (job.status === 'cancelled') return 'neutral';
  return 'success';
}

function jobLabel(job: ActivityJob): string {
  if (job.status === 'running') return 'Em execução';
  if (job.status === 'queued') return 'Aguardando';
  if (job.status === 'failed') return 'Falhou';
  if (job.status === 'cancelled') return 'Cancelado';
  return 'Concluído';
}

function eventTone(event: ActivityEvent): StatusBadgeTone {
  if (event.status === 'failed') return 'danger';
  if (event.status === 'warning') return 'warning';
  if (event.status === 'succeeded') return 'success';
  if (event.status === 'started') return 'info';
  return 'neutral';
}

function eventStatus(event: ActivityEvent): string {
  if (event.status === 'failed') return 'Falhou';
  if (event.status === 'warning') return 'Atenção';
  if (event.status === 'succeeded') return 'Concluído';
  if (event.status === 'started') return 'Iniciado';
  if (event.status === 'cancelled') return 'Cancelado';
  return 'Evento';
}

function formatTime(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function load(): Promise<void> {
  if (loading.value) return;
  const request = ++generation;
  const pending = new AbortController();
  controller = pending;
  loading.value = true;
  errorMessage.value = '';
  try {
    const next = await fetchActivity(100, pending.signal);
    if (request === generation && !disposed && !pending.signal.aborted) {
      snapshot.value = {
        ...next,
        jobs: [...new Map(next.jobs.map((job) => [job.id, job])).values()],
        events: [
          ...new Map(next.events.map((event) => [event.id, event])).values(),
        ],
      };
    }
  } catch (error) {
    if (request === generation && !disposed && !pending.signal.aborted)
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar a atividade.';
  } finally {
    if (request === generation) {
      loading.value = false;
      controller = undefined;
      schedule();
    }
  }
}

async function cancelJob(job: ActivityJob): Promise<void> {
  if (!canCancelActivityJob(job) || cancellingJobId.value) return;
  cancellingJobId.value = job.id;
  errorMessage.value = '';
  try {
    await cancelActivityJob(job);
    await load();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar o job.';
  } finally {
    cancellingJobId.value = '';
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', visibilityChanged);
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  stopTimer();
  controller?.abort();
  document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>

<template>
  <section class="activity-center-page" aria-label="Atividade e jobs">
    <header class="activity-center-header">
      <div>
        <span>Operações locais</span>
        <h1>Atividade</h1>
        <p>O que está rodando agora e o que aconteceu recentemente.</p>
        <small v-if="snapshot"
          >Atualizado em {{ formatTime(snapshot.generatedAt) }}</small
        >
      </div>
      <button
        class="secondary-button activity-center-refresh"
        type="button"
        :disabled="loading"
        @click="load"
      >
        <ArrowPathIcon aria-hidden="true" />
        Atualizar
      </button>
    </header>

    <div v-if="errorMessage" class="activity-center-error" role="alert">
      {{ errorMessage }}
    </div>

    <EmptyState
      v-if="loading && !snapshot"
      icon="•••"
      title="Carregando atividade"
      description="Agregando jobs e eventos dos domínios locais."
    />

    <template v-else>
      <p v-if="snapshot?.partial" class="activity-center-partial" role="status">
        Snapshot parcial. Indisponível:
        {{ snapshot.unavailableDomains.join(', ') }}.
      </p>

      <section class="activity-center-section" aria-labelledby="jobs-title">
        <div class="activity-center-section-heading">
          <div>
            <span>Jobs Center</span>
            <h2 id="jobs-title">Em andamento</h2>
          </div>
          <strong>{{ jobs.length }}</strong>
        </div>

        <div v-if="(snapshot?.jobs.length ?? 0) > 5" class="activity-filters">
          <label
            >Projeto
            <select v-model="jobsProjectFilter">
              <option value="">Todos</option>
              <option v-for="id in projectChoices" :key="id" :value="id">
                {{ projectName(id) }}
              </option>
            </select></label
          >
          <label
            >Domínio
            <select v-model="jobsDomainFilter">
              <option value="">Todos</option>
              <option
                v-for="domain in domainChoices"
                :key="domain"
                :value="domain"
              >
                {{ domain }}
              </option>
            </select></label
          >
        </div>
        <EmptyState
          v-if="jobs.length === 0"
          class="activity-center-empty"
          icon="◇"
          title="Nenhum job ativo"
          description="Execuções em andamento aparecerão aqui."
        />

        <div v-else class="activity-job-list">
          <article v-for="job in jobs" :key="job.id" class="activity-job-card">
            <div
              class="activity-job-icon"
              :class="{ 'is-agent': job.domain === 'agent' }"
            >
              <CpuChipIcon v-if="job.domain === 'agent'" aria-hidden="true" />
              <PlayPauseIcon v-else aria-hidden="true" />
            </div>

            <div class="activity-job-copy">
              <div class="activity-job-title">
                <strong>{{ projectName(job.projectId) }}</strong>
                <StatusBadge :tone="jobTone(job)">{{
                  jobLabel(job)
                }}</StatusBadge>
              </div>
              <p>
                {{ job.domain === 'agent' ? 'Agente' : job.action }}
                <template v-if="job.stage"> · {{ job.stage }}</template>
                <template v-if="job.providerId">
                  · {{ job.providerId }}</template
                >
              </p>
              <small>
                Início {{ formatTime(job.startedAt) }}
                <template v-if="job.attempts !== undefined">
                  · {{ job.attempts }} tentativa(s)
                </template>
                <template v-if="job.timingIncomplete">
                  · timing incompleto</template
                >
              </small>
            </div>

            <div class="activity-job-actions">
              <RouterLink
                v-if="resolveActivityResource(job).to"
                class="secondary-button link-button"
                :to="resolveActivityResource(job).to!"
                >{{ resolveActivityResource(job).label }}</RouterLink
              >
              <span v-else class="activity-resource-unavailable">{{
                resolveActivityResource(job).label
              }}</span>
              <button
                v-if="canCancelActivityJob(job)"
                class="secondary-button"
                type="button"
                :disabled="Boolean(cancellingJobId)"
                @click="cancelJob(job)"
              >
                {{ cancellingJobId === job.id ? 'Cancelando…' : 'Cancelar' }}
              </button>
            </div>
          </article>
        </div>
      </section>
      <section class="activity-center-section" aria-labelledby="timeline-title">
        <div class="activity-center-section-heading">
          <div>
            <span>Timeline</span>
            <h2 id="timeline-title">Atividade recente</h2>
          </div>
          <strong>{{ events.length }}</strong>
        </div>
        <div class="activity-filters">
          <label
            >Projeto
            <select v-model="projectFilter">
              <option value="">Todos</option>
              <option v-for="id in projectChoices" :key="id" :value="id">
                {{ projectName(id) }}
              </option>
            </select></label
          >
          <label
            >Domínio
            <select v-model="domainFilter">
              <option value="">Todos</option>
              <option
                v-for="domain in domainChoices"
                :key="domain"
                :value="domain"
              >
                {{ domain }}
              </option>
            </select></label
          >
          <label
            >Status
            <select v-model="statusFilter">
              <option value="">Todos</option>
              <option
                v-for="status in [
                  'started',
                  'succeeded',
                  'failed',
                  'cancelled',
                  'warning',
                ]"
                :key="status"
                :value="status"
              >
                {{ status }}
              </option>
            </select></label
          >
        </div>
        <EmptyState
          v-if="events.length === 0"
          class="activity-center-empty"
          icon="◇"
          title="Sem atividade recente"
          description="Eventos normalizados aparecerão aqui."
        />
        <ol v-else class="activity-event-list">
          <li v-for="event in events" :key="event.id">
            <div>
              <strong>{{ projectName(event.projectId) }}</strong>
              <StatusBadge :tone="eventTone(event)">{{
                eventStatus(event)
              }}</StatusBadge>
            </div>
            <p>{{ event.summary }}</p>
            <small
              >{{ event.domain }} · {{ formatTime(event.occurredAt) }}</small
            >
            <RouterLink
              v-if="resolveActivityResource(event).to"
              :to="resolveActivityResource(event).to!"
              >{{ resolveActivityResource(event).label }}</RouterLink
            >
          </li>
        </ol>
      </section>
    </template>
  </section>
</template>

<style scoped>
.activity-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.activity-filters label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.activity-filters select {
  max-width: 210px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-1);
}
.activity-resource-unavailable {
  font-size: 12px;
  color: var(--text-muted);
}
.activity-center-page {
  display: grid;
  gap: 18px;
  min-height: 100vh;
  padding: 28px;
  background: var(--surface-0);
}

.activity-center-header,
.activity-center-section-heading,
.activity-job-title,
.activity-job-actions,
.activity-event-list li > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.activity-center-header {
  align-items: flex-start;
}

.activity-center-header > div {
  display: grid;
  gap: 4px;
}

.activity-center-header span,
.activity-center-section-heading span {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.activity-center-header h1,
.activity-center-header p,
.activity-center-section-heading h2,
.activity-job-copy p,
.activity-event-list p {
  margin: 0;
}

.activity-center-header h1 {
  font-size: 32px;
  letter-spacing: -0.04em;
}

.activity-center-header p {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.activity-center-refresh {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.activity-center-refresh svg {
  width: 16px;
  height: 16px;
}

.activity-center-error,
.activity-center-partial {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
}

.activity-center-error {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.activity-center-partial {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.activity-center-section {
  display: grid;
  gap: 10px;
}

.activity-center-section-heading {
  padding: 0 2px;
}

.activity-center-section-heading > div {
  display: grid;
  gap: 2px;
}

.activity-center-section-heading h2 {
  font-size: 18px;
}

.activity-center-section-heading > strong {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.activity-job-list,
.activity-event-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-job-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.activity-job-icon {
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
}

.activity-job-icon.is-agent {
  color: var(--accent);
  background: var(--accent-soft);
}

.activity-job-icon svg {
  width: 19px;
  height: 19px;
}

.activity-job-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.activity-job-title {
  justify-content: flex-start;
}

.activity-job-copy p,
.activity-job-copy small,
.activity-event-list small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.activity-job-actions {
  justify-content: flex-end;
}

.activity-event-list li {
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.activity-event-list li > div {
  justify-content: flex-start;
}

.activity-event-list p {
  color: var(--text);
  font-size: var(--font-xs);
}

.activity-event-list a {
  width: fit-content;
  color: var(--accent);
  font-size: var(--font-xs);
  text-decoration: none;
}

.activity-event-list a:hover {
  text-decoration: underline;
}

.activity-center-empty {
  min-height: 150px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

@media (max-width: 760px) {
  .activity-center-page {
    padding: 18px 12px;
  }

  .activity-center-header,
  .activity-job-card {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .activity-center-header {
    flex-direction: column;
  }

  .activity-job-icon {
    display: none;
  }

  .activity-job-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
