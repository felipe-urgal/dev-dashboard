<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
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

const overallCopy = computed(() => {
  if (!report.value) return null;
  if (report.value.overallStatus === 'healthy') {
    return {
      title: 'Projeto pronto para trabalhar',
      description:
        'Os sinais verificados não apontaram bloqueios ou pendências.',
      tone: 'success' as const,
      icon: ShieldCheckIcon,
      label: 'Saudável',
    };
  }
  if (report.value.overallStatus === 'blocked') {
    return {
      title: 'Há bloqueios no projeto',
      description:
        'Resolva os itens com falha antes de iniciar os fluxos principais.',
      tone: 'danger' as const,
      icon: XCircleIcon,
      label: 'Bloqueado',
    };
  }
  return {
    title: 'O projeto precisa de atenção',
    description:
      'Há recomendações que podem evitar falhas durante o desenvolvimento.',
    tone: 'warning' as const,
    icon: ExclamationTriangleIcon,
    label: 'Atenção',
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
    return {
      name: 'project-database',
      params: { projectId: props.project.id },
    };
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
    aria-labelledby="project-doctor-title"
    :aria-busy="loading"
  >
    <article class="project-doctor-card">
      <header class="project-doctor-header">
        <div class="project-doctor-heading">
          <span class="project-doctor-heading-icon">
            <ShieldCheckIcon aria-hidden="true" />
          </span>
          <div>
            <h3 id="project-doctor-title">Project Doctor</h3>
            <p>Análise rápida da saúde do projeto</p>
          </div>
        </div>

        <button type="button" :disabled="loading" @click="load(true)">
          <ArrowPathIcon
            aria-hidden="true"
            :class="{ 'is-spinning': loading }"
          />
          {{ loading ? 'Analisando…' : 'Executar nova análise' }}
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
        <section
          class="project-doctor-areas"
          aria-labelledby="doctor-areas-title"
        >
          <header>
            <h4 id="doctor-areas-title">Áreas analisadas</h4>
            <span>Saúde</span>
          </header>

          <div class="project-doctor-category-list">
            <details
              v-for="group in groupedChecks"
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
                  <StatusBadge :tone="statusTone(groupStatus(group.checks))">
                    {{ statusLabel(groupStatus(group.checks)) }}
                  </StatusBadge>
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

        <footer
          class="project-doctor-result"
          :class="`is-${report.overallStatus}`"
        >
          <component :is="overallCopy.icon" aria-hidden="true" />
          <div>
            <strong>{{ overallCopy.title }}</strong>
            <p>{{ overallCopy.description }}</p>
          </div>
          <StatusBadge :tone="overallCopy.tone">
            {{ overallCopy.label }}
          </StatusBadge>
        </footer>

        <div class="project-doctor-meta">
          <span>Atualizado em {{ formatGeneratedAt(report.generatedAt) }}</span>
          <span>
            Somente leitura. Valores e credenciais não são exibidos.
          </span>
        </div>
      </template>
    </article>
  </section>
</template>

<style scoped src="./ProjectDoctorPanel.css"></style>
