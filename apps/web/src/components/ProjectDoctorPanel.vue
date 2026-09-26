<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import type {
  Project,
  ProjectDiagnosticActionTarget,
  ProjectDiagnosticCategory,
  ProjectDiagnosticCheck,
  ProjectDiagnosticReport,
  ProjectDiagnosticStatus,
} from '@dev-dashboard/contracts';

import { fetchProjectDoctor } from '../api';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const report = ref<ProjectDiagnosticReport | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let generation = 0;

const categoryOrder: ProjectDiagnosticCategory[] = [
  'project',
  'runtime',
  'dependencies',
  'configuration',
];

const categoryLabels: Record<ProjectDiagnosticCategory, string> = {
  project: 'Projeto',
  runtime: 'Runtimes',
  dependencies: 'Dependências',
  configuration: 'Configuração',
};

const groupedChecks = computed(() =>
  categoryOrder
    .map((category) => ({
      category,
      label: categoryLabels[category],
      checks:
        report.value?.checks.filter((check) => check.category === category) ??
        [],
    }))
    .filter((group) => group.checks.length > 0),
);

const totalChecks = computed(() => {
  if (!report.value) return 0;
  const { passed, warnings, failed, skipped } = report.value.summary;
  return passed + warnings + failed + skipped;
});

const pendingChecks = computed(() => {
  if (!report.value) return 0;
  const { warnings, failed, skipped } = report.value.summary;
  return warnings + failed + skipped;
});

const actionGroups = computed(() =>
  groupedChecks.value.filter((group) => groupStatus(group.checks) !== 'passed'),
);

const approvedGroups = computed(() =>
  groupedChecks.value.filter((group) => groupStatus(group.checks) === 'passed'),
);

const overallCopy = computed(() => {
  if (!report.value) return null;
  if (report.value.overallStatus === 'healthy') {
    return {
      label: 'Saudável',
      icon: CheckCircleIcon,
    };
  }
  if (report.value.overallStatus === 'blocked') {
    return {
      label: 'Bloqueado',
      icon: XCircleIcon,
    };
  }
  return {
    label: 'Atenção',
    icon: ExclamationTriangleIcon,
  };
});

function statusTone(
  status: ProjectDiagnosticStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'passed') return 'success';
  if (status === 'warning') return 'warning';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

function statusLabel(status: ProjectDiagnosticStatus): string {
  if (status === 'passed') return 'Boa';
  if (status === 'warning') return 'Atenção';
  if (status === 'failed') return 'Bloqueio';
  return 'Não verificado';
}

function statusIcon(status: ProjectDiagnosticStatus) {
  if (status === 'passed') return CheckCircleIcon;
  if (status === 'warning') return ExclamationTriangleIcon;
  if (status === 'failed') return XCircleIcon;
  return InformationCircleIcon;
}

function groupStatus(
  checks: ProjectDiagnosticCheck[],
): ProjectDiagnosticStatus {
  if (checks.some((check) => check.status === 'failed')) return 'failed';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  if (checks.some((check) => check.status === 'skipped')) return 'skipped';
  return 'passed';
}

function completedChecks(checks: ProjectDiagnosticCheck[]): number {
  return checks.filter((check) => check.status === 'passed').length;
}

function pendingGroupChecks(checks: ProjectDiagnosticCheck[]): number {
  return checks.filter((check) => check.status !== 'passed').length;
}

function groupDetail(checks: ProjectDiagnosticCheck[]): string {
  const pendingCheck = checks.find((check) => check.status !== 'passed');
  if (pendingCheck) return pendingCheck.summary;
  return `${completedChecks(checks)}/${checks.length} ${
    checks.length === 1 ? 'verificação' : 'verificações'
  }`;
}

function groupPendingLabel(checks: ProjectDiagnosticCheck[]): string {
  const count = pendingGroupChecks(checks);
  const status = groupStatus(checks);

  if (status === 'failed')
    return `${count} ${count === 1 ? 'problema' : 'problemas'}`;
  if (status === 'warning')
    return `${count} ${count === 1 ? 'alerta' : 'alertas'}`;
  return `${count} ${count === 1 ? 'pendência' : 'pendências'}`;
}

function actionDestination(
  target: ProjectDiagnosticActionTarget,
): RouteLocationRaw {
  if (target === 'environment') {
    return {
      name: 'project-environment',
      params: { projectId: props.project.id },
    };
  }
  if (target === 'server') {
    return {
      name: 'project-server',
      params: { projectId: props.project.id },
    };
  }
  if (target === 'database') {
    return { name: 'database' };
  }
  return {
    name: 'project-dependencies',
    params: { projectId: props.project.id },
  };
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

async function load(refresh = false): Promise<void> {
  const current = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchProjectDoctor(props.project.id, refresh);
    if (current !== generation) return;
    report.value = result;
  } catch (error) {
    if (current === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível diagnosticar o projeto.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

watch(
  () => props.project.id,
  () => {
    report.value = null;
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section
    class="project-doctor-panel"
    aria-label="Diagnóstico"
    :aria-busy="loading"
  >
    <article class="project-doctor-card">
      <header v-if="report && overallCopy" class="project-doctor-intro">
        <div class="project-doctor-state">
          <span
            class="project-doctor-overall-status"
            :class="`is-${report.overallStatus}`"
          >
            <component :is="overallCopy.icon" aria-hidden="true" />
            {{ overallCopy.label }}
          </span>
          <span>
            Atualizado em {{ formatGeneratedAt(report.generatedAt) }}
          </span>
        </div>

        <button
          type="button"
          class="secondary-button project-doctor-refresh"
          :disabled="loading"
          aria-label="Atualizar diagnóstico"
          title="Atualizar diagnóstico"
          @click="load(true)"
        >
          <ArrowPathIcon
            :class="{ 'is-spinning': loading }"
            aria-hidden="true"
          />
        </button>
      </header>

      <div v-if="errorMessage" class="project-doctor-alert" role="alert">
        <div>
          <strong>Não foi possível concluir o diagnóstico</strong>
          <span>{{ errorMessage }}</span>
        </div>
        <button type="button" @click="load(true)">Tentar novamente</button>
      </div>

      <div v-if="loading && !report" class="project-doctor-empty" role="status">
        <ArrowPathIcon aria-hidden="true" class="is-spinning" />
        <strong>Analisando o projeto</strong>
        <span>Os checks são somente leitura e possuem timeout curto.</span>
      </div>

      <template v-else-if="report && overallCopy">
        <section class="project-doctor-summary" aria-label="Resumo operacional">
          <InformationCircleIcon aria-hidden="true" />
          <p>
            <strong>{{ pendingChecks }} problemas</strong> encontrados
            <span aria-hidden="true">·</span>
            <strong>
              {{ report.summary.passed }} de {{ totalChecks }} verificações
              aprovadas
            </strong>
          </p>
        </section>

        <section
          v-if="actionGroups.length > 0"
          class="project-doctor-section project-doctor-action-section"
          aria-labelledby="doctor-action-title"
        >
          <header class="project-doctor-section-header">
            <span
              class="project-doctor-section-icon"
              :class="`is-${report.overallStatus}`"
            >
              <ExclamationTriangleIcon aria-hidden="true" />
            </span>
            <div>
              <h4 id="doctor-action-title">Requer ação</h4>
              <p>Corrija os itens abaixo para habilitar o ambiente.</p>
            </div>
          </header>

          <div class="project-doctor-category-list">
            <details
              v-for="group in actionGroups"
              :key="group.category"
              class="project-doctor-category"
            >
              <summary>
                <div class="project-doctor-category-main">
                  <span
                    class="project-doctor-category-icon"
                    :class="`is-${groupStatus(group.checks)}`"
                  >
                    <component
                      :is="statusIcon(groupStatus(group.checks))"
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <strong>{{ group.label }}</strong>
                    <span>{{ groupDetail(group.checks) }}</span>
                  </div>
                </div>

                <div class="project-doctor-category-status">
                  <StatusBadge :tone="statusTone(groupStatus(group.checks))">
                    {{ statusLabel(groupStatus(group.checks)) }}
                  </StatusBadge>
                  <span class="project-doctor-category-count">
                    {{ groupPendingLabel(group.checks) }}
                  </span>
                  <ChevronDownIcon aria-hidden="true" />
                </div>
              </summary>

              <div class="project-doctor-check-list">
                <article
                  v-for="check in group.checks"
                  :key="check.id"
                  class="project-doctor-check"
                  :class="`is-${check.status}`"
                >
                  <component
                    :is="statusIcon(check.status)"
                    aria-hidden="true"
                  />
                  <div class="project-doctor-check-copy">
                    <div>
                      <strong>{{ check.label }}</strong>
                      <StatusBadge :tone="statusTone(check.status)">
                        {{ statusLabel(check.status) }}
                      </StatusBadge>
                    </div>
                    <p>{{ check.summary }}</p>
                    <small v-if="check.recommendation">
                      {{ check.recommendation }}
                    </small>
                  </div>
                  <RouterLink
                    v-if="check.action"
                    class="project-doctor-action"
                    :to="actionDestination(check.action.target)"
                  >
                    {{ check.action.label }}
                  </RouterLink>
                </article>
              </div>
            </details>
          </div>
        </section>

        <section
          v-if="approvedGroups.length > 0"
          class="project-doctor-section project-doctor-approved-section"
          aria-labelledby="doctor-approved-title"
        >
          <header class="project-doctor-section-header">
            <span class="project-doctor-section-icon is-healthy">
              <CheckCircleIcon aria-hidden="true" />
            </span>
            <div>
              <h4 id="doctor-approved-title">Aprovados</h4>
              <p>Verificações concluídas com sucesso.</p>
            </div>
          </header>

          <div class="project-doctor-category-list">
            <details
              v-for="group in approvedGroups"
              :key="group.category"
              class="project-doctor-category"
            >
              <summary>
                <div class="project-doctor-category-main">
                  <span class="project-doctor-category-icon is-passed">
                    <CheckCircleIcon aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{{ group.label }}</strong>
                    <span>
                      {{ completedChecks(group.checks) }}/{{
                        group.checks.length
                      }}
                      {{
                        group.checks.length === 1
                          ? 'verificação'
                          : 'verificações'
                      }}
                    </span>
                  </div>
                </div>

                <div class="project-doctor-category-status">
                  <StatusBadge tone="success">Boa</StatusBadge>
                  <ChevronDownIcon aria-hidden="true" />
                </div>
              </summary>

              <div class="project-doctor-check-list">
                <article
                  v-for="check in group.checks"
                  :key="check.id"
                  class="project-doctor-check"
                  :class="`is-${check.status}`"
                >
                  <component
                    :is="statusIcon(check.status)"
                    aria-hidden="true"
                  />
                  <div class="project-doctor-check-copy">
                    <div>
                      <strong>{{ check.label }}</strong>
                      <StatusBadge :tone="statusTone(check.status)">
                        {{ statusLabel(check.status) }}
                      </StatusBadge>
                    </div>
                    <p>{{ check.summary }}</p>
                    <small v-if="check.recommendation">
                      {{ check.recommendation }}
                    </small>
                  </div>
                  <RouterLink
                    v-if="check.action"
                    class="project-doctor-action"
                    :to="actionDestination(check.action.target)"
                  >
                    {{ check.action.label }}
                  </RouterLink>
                </article>
              </div>
            </details>
          </div>
        </section>

        <div class="project-doctor-meta">
          <InformationCircleIcon aria-hidden="true" />
          <span>Somente leitura. Valores e credenciais não são exibidos.</span>
        </div>
      </template>
    </article>
  </section>
</template>

<style scoped src="./ProjectDoctorPanel.css"></style>
