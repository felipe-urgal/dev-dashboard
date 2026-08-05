<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import {
  RouterLink,
  type RouteLocationRaw,
} from 'vue-router';

import type {
  Project,
  ProjectDiagnosticActionTarget,
  ProjectDiagnosticCategory,
  ProjectDiagnosticReport,
  ProjectDiagnosticStatus,
} from '@dev-dashboard/contracts';

import { fetchProjectDoctor } from '../api';
import StatusBadge from './StatusBadge.vue';

type DoctorPrototype = 'compact' | 'priority' | 'checklist';

const props = defineProps<{ project: Project }>();

const report = ref<ProjectDiagnosticReport | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const activePrototype = ref<DoctorPrototype>('compact');
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

const prototypeOptions: Array<{
  id: DoctorPrototype;
  label: string;
  description: string;
}> = [
  {
    id: 'compact',
    label: '1. Compacta',
    description: 'Resumo curto e checks agrupados.',
  },
  {
    id: 'priority',
    label: '2. Prioridades',
    description: 'Pendências primeiro, detalhes depois.',
  },
  {
    id: 'checklist',
    label: '3. Checklist',
    description: 'Progresso e leitura operacional.',
  },
];

const groupedChecks = computed(() => categoryOrder
  .map((category) => ({
    category,
    label: categoryLabels[category],
    checks: report.value?.checks.filter((check) => check.category === category) ?? [],
  }))
  .filter((group) => group.checks.length > 0));

const attentionChecks = computed(() => report.value?.checks.filter(
  (check) => check.status === 'failed' || check.status === 'warning',
) ?? []);

const remainingChecks = computed(() => report.value?.checks.filter(
  (check) => check.status !== 'failed' && check.status !== 'warning',
) ?? []);

const sortedChecks = computed(() => {
  const priority: Record<ProjectDiagnosticStatus, number> = {
    failed: 0,
    warning: 1,
    skipped: 2,
    passed: 3,
  };
  return [...(report.value?.checks ?? [])].sort(
    (left, right) => priority[left.status] - priority[right.status],
  );
});

const completionPercent = computed(() => {
  if (!report.value || report.value.checks.length === 0) return 0;
  return Math.round(
    (report.value.summary.passed / report.value.checks.length) * 100,
  );
});

const overallCopy = computed(() => {
  if (!report.value) return null;
  if (report.value.overallStatus === 'healthy') {
    return {
      title: 'Projeto pronto para trabalhar',
      description: 'Os sinais verificados não apontaram bloqueios ou pendências.',
      tone: 'success' as const,
      icon: ShieldCheckIcon,
    };
  }
  if (report.value.overallStatus === 'blocked') {
    return {
      title: 'Há bloqueios no projeto',
      description: 'Resolva os itens com falha antes de iniciar os fluxos principais.',
      tone: 'danger' as const,
      icon: XCircleIcon,
    };
  }
  return {
    title: 'O projeto precisa de atenção',
    description: 'Há recomendações que podem evitar falhas durante o desenvolvimento.',
    tone: 'warning' as const,
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
  if (status === 'passed') return 'Pronto';
  if (status === 'warning') return 'Atenção';
  if (status === 'failed') return 'Bloqueado';
  return 'Não verificado';
}

function statusIcon(status: ProjectDiagnosticStatus) {
  if (status === 'passed') return CheckCircleIcon;
  if (status === 'warning') return ExclamationTriangleIcon;
  if (status === 'failed') return XCircleIcon;
  return InformationCircleIcon;
}

function actionDestination(
  target: ProjectDiagnosticActionTarget,
): RouteLocationRaw {
  if (target === 'settings') return { name: 'settings' };
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
      errorMessage.value = error instanceof Error
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
    aria-label="Diagnóstico do projeto"
    :aria-busy="loading"
  >
    <nav class="project-doctor-prototypes" aria-label="Versões do Project Doctor">
      <button
        v-for="option in prototypeOptions"
        :key="option.id"
        type="button"
        :class="{ active: activePrototype === option.id }"
        :aria-pressed="activePrototype === option.id"
        @click="activePrototype = option.id"
      >
        <strong>{{ option.label }}</strong>
        <span>{{ option.description }}</span>
      </button>
    </nav>

    <header class="project-doctor-header">
      <p>
        Diagnóstico somente leitura. Nenhum arquivo, dependência ou configuração
        é alterado.
      </p>
      <button type="button" :disabled="loading" @click="load(true)">
        <ArrowPathIcon aria-hidden="true" :class="{ 'is-spinning': loading }" />
        {{ loading ? 'Verificando…' : 'Verificar novamente' }}
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
        v-if="activePrototype === 'compact'"
        class="doctor-compact"
        aria-label="Versão compacta"
      >
        <div
          class="doctor-compact-overview"
          :class="`is-${report.overallStatus}`"
        >
          <component :is="overallCopy.icon" aria-hidden="true" />
          <div class="doctor-overview-copy">
            <div>
              <h3>{{ overallCopy.title }}</h3>
              <StatusBadge :tone="overallCopy.tone">
                {{
                  report.overallStatus === 'healthy'
                    ? 'Saudável'
                    : report.overallStatus === 'blocked'
                      ? 'Bloqueado'
                      : 'Atenção'
                }}
              </StatusBadge>
            </div>
            <p>{{ overallCopy.description }}</p>
          </div>
          <div class="doctor-inline-summary" aria-label="Resumo do diagnóstico">
            <span><strong>{{ report.summary.passed }}</strong> prontos</span>
            <span><strong>{{ report.summary.warnings }}</strong> atenções</span>
            <span><strong>{{ report.summary.failed }}</strong> bloqueios</span>
            <span><strong>{{ report.summary.skipped }}</strong> ignorados</span>
          </div>
        </div>

        <section
          v-for="group in groupedChecks"
          :key="group.category"
          class="doctor-compact-group"
        >
          <header>
            <h4>{{ group.label }}</h4>
            <span>{{ group.checks.length }}</span>
          </header>

          <div class="doctor-check-list">
            <article
              v-for="check in group.checks"
              :key="check.id"
              class="project-doctor-check"
              :class="`is-${check.status}`"
            >
              <component :is="statusIcon(check.status)" aria-hidden="true" />
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
        </section>
      </section>

      <section
        v-else-if="activePrototype === 'priority'"
        class="doctor-priority"
        aria-label="Versão prioridades"
      >
        <aside
          class="doctor-priority-rail"
          :class="`is-${report.overallStatus}`"
        >
          <component :is="overallCopy.icon" aria-hidden="true" />
          <StatusBadge :tone="overallCopy.tone">
            {{
              report.overallStatus === 'healthy'
                ? 'Saudável'
                : report.overallStatus === 'blocked'
                  ? 'Bloqueado'
                  : 'Atenção'
            }}
          </StatusBadge>
          <strong class="doctor-priority-number">
            {{ report.summary.failed + report.summary.warnings }}
          </strong>
          <span>itens pedem atenção</span>
          <p>{{ overallCopy.title }}</p>

          <dl>
            <div>
              <dt>Bloqueios</dt>
              <dd>{{ report.summary.failed }}</dd>
            </div>
            <div>
              <dt>Atenções</dt>
              <dd>{{ report.summary.warnings }}</dd>
            </div>
            <div>
              <dt>Prontos</dt>
              <dd>{{ report.summary.passed }}</dd>
            </div>
            <div>
              <dt>Ignorados</dt>
              <dd>{{ report.summary.skipped }}</dd>
            </div>
          </dl>
        </aside>

        <div class="doctor-priority-content">
          <section class="doctor-priority-section">
            <header>
              <div>
                <h3>Ação necessária</h3>
                <p>Itens que podem bloquear ou causar falhas no fluxo.</p>
              </div>
              <span>{{ attentionChecks.length }}</span>
            </header>

            <div
              v-if="attentionChecks.length === 0"
              class="doctor-priority-empty"
            >
              <CheckCircleIcon aria-hidden="true" />
              <strong>Nenhuma ação pendente</strong>
              <span>Os checks prioritários estão em ordem.</span>
            </div>

            <div v-else class="doctor-check-list">
              <article
                v-for="check in attentionChecks"
                :key="check.id"
                class="project-doctor-check"
                :class="`is-${check.status}`"
              >
                <component :is="statusIcon(check.status)" aria-hidden="true" />
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
          </section>

          <section class="doctor-priority-section is-secondary">
            <header>
              <div>
                <h3>Demais verificações</h3>
                <p>Itens prontos ou que não se aplicam ao projeto.</p>
              </div>
              <span>{{ remainingChecks.length }}</span>
            </header>

            <div class="doctor-check-list">
              <article
                v-for="check in remainingChecks"
                :key="check.id"
                class="project-doctor-check"
                :class="`is-${check.status}`"
              >
                <component :is="statusIcon(check.status)" aria-hidden="true" />
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
          </section>
        </div>
      </section>

      <section
        v-else
        class="doctor-checklist"
        aria-label="Versão checklist"
      >
        <header class="doctor-checklist-overview">
          <div>
            <span>Progresso do diagnóstico</span>
            <strong>{{ completionPercent }}%</strong>
          </div>
          <div
            class="doctor-progress-track"
            role="progressbar"
            aria-label="Checks prontos"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="completionPercent"
          >
            <span :style="{ width: `${completionPercent}%` }"></span>
          </div>
          <p>
            {{ report.summary.passed }} de {{ report.checks.length }} checks
            estão prontos. {{ overallCopy.description }}
          </p>
        </header>

        <div class="doctor-checklist-head" aria-hidden="true">
          <span>Status</span>
          <span>Verificação</span>
          <span>Resultado</span>
          <span>Ação</span>
        </div>

        <div class="doctor-checklist-rows">
          <article
            v-for="check in sortedChecks"
            :key="check.id"
            class="project-doctor-check doctor-checklist-row"
            :class="`is-${check.status}`"
          >
            <div class="doctor-checklist-status">
              <component :is="statusIcon(check.status)" aria-hidden="true" />
              <StatusBadge :tone="statusTone(check.status)">
                {{ statusLabel(check.status) }}
              </StatusBadge>
            </div>
            <div class="doctor-checklist-name">
              <strong>{{ check.label }}</strong>
              <span>{{ categoryLabels[check.category] }}</span>
            </div>
            <div class="doctor-checklist-result">
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
            <span v-else class="doctor-checklist-no-action">—</span>
          </article>
        </div>
      </section>

      <footer class="project-doctor-footer">
        <span>Atualizado em {{ formatGeneratedAt(report.generatedAt) }}</span>
        <span>
          O relatório lê somente arquivos conhecidos e nomes de variáveis.
          Valores e credenciais não são exibidos.
        </span>
      </footer>
    </template>
  </section>
</template>

<style scoped src="./ProjectDoctorPanel.css"></style>
