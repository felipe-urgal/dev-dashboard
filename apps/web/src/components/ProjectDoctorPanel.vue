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

const groupedChecks = computed(() => categoryOrder
  .map((category) => ({
    category,
    label: categoryLabels[category],
    checks: report.value?.checks.filter((check) => check.category === category) ?? [],
  }))
  .filter((group) => group.checks.length > 0));

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
    aria-labelledby="project-doctor-title"
    :aria-busy="loading"
  >
    <header class="project-doctor-header">
      <div>
        <span>Projeto / Diagnóstico</span>
        <h3 id="project-doctor-title">Project Doctor</h3>
        <p>
          Verifica estrutura, runtimes, dependências e configuração sem alterar
          arquivos ou instalar ferramentas.
        </p>
      </div>
      <button type="button" :disabled="loading" @click="load(true)">
        <ArrowPathIcon aria-hidden="true" :class="{ 'is-spinning': loading }" />
        {{ loading ? 'Verificando…' : 'Verificar novamente' }}
      </button>
    </header>

    <div v-if="errorMessage" class="project-doctor-alert" role="alert">
      <strong>Não foi possível concluir o diagnóstico</strong>
      <span>{{ errorMessage }}</span>
      <button type="button" @click="load(true)">Tentar novamente</button>
    </div>

    <div v-if="loading && !report" class="project-doctor-empty" role="status">
      <ArrowPathIcon aria-hidden="true" class="is-spinning" />
      <strong>Analisando o projeto</strong>
      <span>Os checks são somente leitura e possuem timeout curto.</span>
    </div>

    <template v-else-if="report && overallCopy">
      <article
        class="project-doctor-overall"
        :class="`is-${report.overallStatus}`"
      >
        <component :is="overallCopy.icon" aria-hidden="true" />
        <div>
          <StatusBadge :tone="overallCopy.tone">
            {{ report.overallStatus === 'healthy' ? 'Saudável' : report.overallStatus === 'blocked' ? 'Bloqueado' : 'Atenção' }}
          </StatusBadge>
          <h4>{{ overallCopy.title }}</h4>
          <p>{{ overallCopy.description }}</p>
        </div>
        <small>Atualizado em {{ formatGeneratedAt(report.generatedAt) }}</small>
      </article>

      <div class="project-doctor-summary" aria-label="Resumo do diagnóstico">
        <article>
          <strong>{{ report.summary.passed }}</strong>
          <span>Prontos</span>
        </article>
        <article>
          <strong>{{ report.summary.warnings }}</strong>
          <span>Atenções</span>
        </article>
        <article>
          <strong>{{ report.summary.failed }}</strong>
          <span>Bloqueios</span>
        </article>
        <article>
          <strong>{{ report.summary.skipped }}</strong>
          <span>Não verificados</span>
        </article>
      </div>

      <section
        v-for="group in groupedChecks"
        :key="group.category"
        class="project-doctor-group"
      >
        <header>
          <h4>{{ group.label }}</h4>
          <span>{{ group.checks.length }} check(s)</span>
        </header>

        <div class="project-doctor-checks">
          <article
            v-for="check in group.checks"
            :key="check.id"
            class="project-doctor-check"
            :class="`is-${check.status}`"
          >
            <span class="project-doctor-check-icon">
              <component :is="statusIcon(check.status)" aria-hidden="true" />
            </span>
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

      <footer class="project-doctor-footer">
        O relatório pode ler somente arquivos conhecidos e nomes de variáveis.
        Valores, credenciais e conteúdo sensível não são devolvidos à interface.
      </footer>
    </template>
  </section>
</template>

<style scoped src="./ProjectDoctorPanel.css"></style>
