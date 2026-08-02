<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CommandLineIcon,
  PauseIcon,
  PlayIcon,
  WrenchIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type {
  ComposeService,
  ComposeServiceAction,
  ComposeServiceActionConfirmation,
  ComposeServiceBuildConfirmation,
  ComposeServiceLogs,
  ManagedProcess,
  Project,
  ProjectComposeOverview,
} from '@dev-dashboard/contracts';
import {
  fetchComposeServiceBuild,
  fetchComposeServiceBuildLog,
  fetchComposeServiceLogs,
  fetchProjectDocker,
  prepareComposeServiceAction,
  prepareComposeServiceBuild,
  runComposeServiceAction,
  startComposeServiceBuild,
} from '../api';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const overview = ref<ProjectComposeOverview>();
const loading = ref(true);
const errorMessage = ref('');
const feedback = ref('');
const activeService = ref('');
const logs = ref<ComposeServiceLogs>();
const logsLoading = ref(false);
const pendingConfirmation = ref<ComposeServiceActionConfirmation>();
const pendingBuildConfirmation = ref<ComposeServiceBuildConfirmation>();
const builds = ref<Record<string, ManagedProcess | null>>({});
let buildPollingTimer: ReturnType<typeof setTimeout> | undefined;
let logsGeneration = 0;

const services = computed(() => overview.value?.services ?? []);

function buildStatus(serviceName: string): ManagedProcess | null {
  return builds.value[serviceName] ?? null;
}

function isBuilding(serviceName: string): boolean {
  const status = buildStatus(serviceName)?.status;
  return status === 'running' || status === 'starting';
}

function canStartService(service: ComposeService): boolean {
  if (!service.requiresBuild) return true;
  const status = buildStatus(service.name);
  return status?.status === 'stopped' && status.exitCode === 0;
}

function stopBuildPolling(): void {
  if (buildPollingTimer) {
    clearTimeout(buildPollingTimer);
    buildPollingTimer = undefined;
  }
}

function scheduleBuildPolling(): void {
  stopBuildPolling();
  const inFlight = Object.keys(builds.value).filter((name) => isBuilding(name));
  if (inFlight.length === 0) return;
  const requestedProjectId = props.project.id;
  buildPollingTimer = setTimeout(async () => {
    await Promise.all(inFlight.map(async (serviceName) => {
      try {
        const status = await fetchComposeServiceBuild(requestedProjectId, serviceName);
        if (props.project.id === requestedProjectId) builds.value[serviceName] = status;
      } catch {
        // Erros pontuais de polling não devem interromper o acompanhamento do build.
      }
    }));
    if (props.project.id === requestedProjectId) scheduleBuildPolling();
  }, 1_500);
}

async function load(): Promise<void> {
  const requestedProjectId = props.project.id;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchProjectDocker(requestedProjectId);
    if (props.project.id !== requestedProjectId) return;
    overview.value = result;
    const buildableServices = result.services.filter((service) => service.requiresBuild);
    await Promise.all(buildableServices.map(async (service) => {
      try {
        const status = await fetchComposeServiceBuild(requestedProjectId, service.name);
        if (props.project.id === requestedProjectId) builds.value[service.name] = status;
      } catch {
        // Estado de build é informativo; uma falha pontual não deve travar o painel.
      }
    }));
    if (props.project.id === requestedProjectId) scheduleBuildPolling();
  } catch (error) {
    if (props.project.id === requestedProjectId) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar o Docker Compose.';
    }
  } finally {
    if (props.project.id === requestedProjectId) loading.value = false;
  }
}

async function requestBuild(serviceName: string): Promise<void> {
  if (activeService.value || isBuilding(serviceName)) return;
  errorMessage.value = '';
  feedback.value = '';
  try {
    pendingBuildConfirmation.value = await prepareComposeServiceBuild(props.project.id, serviceName);
    feedback.value = `Buildar “${serviceName}” executa instruções do projeto e altera o cache de imagens do Docker. Confirme para continuar.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível preparar a confirmação do build.';
  }
}

async function confirmPendingBuild(): Promise<void> {
  const pending = pendingBuildConfirmation.value;
  if (!pending) return;
  errorMessage.value = '';
  feedback.value = '';
  try {
    builds.value[pending.serviceName] = await startComposeServiceBuild(props.project.id, pending.serviceName, pending.token);
    pendingBuildConfirmation.value = undefined;
    feedback.value = `Build do serviço “${pending.serviceName}” iniciado.`;
    scheduleBuildPolling();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível iniciar o build.';
  }
}

function cancelPendingBuild(): void {
  pendingBuildConfirmation.value = undefined;
  feedback.value = '';
}

async function run(service: ComposeService, action: ComposeServiceAction): Promise<void> {
  if (activeService.value) return;
  feedback.value = '';
  errorMessage.value = '';
  if (action === 'stop' || action === 'restart') {
    try {
      pendingConfirmation.value = await prepareComposeServiceAction(props.project.id, service.name, action);
      feedback.value = `${action === 'stop' ? 'Parar' : 'Reiniciar'} “${service.name}” pode afetar outros projetos. Confirme para continuar.`;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível preparar a confirmação.';
    }
    return;
  }
  await execute(service.name, action);
}

async function execute(
  serviceName: string,
  action: ComposeServiceAction,
  confirmationToken?: string,
): Promise<void> {
  activeService.value = serviceName;
  errorMessage.value = '';
  feedback.value = '';
  try {
    await runComposeServiceAction(props.project.id, serviceName, action, confirmationToken);
    pendingConfirmation.value = undefined;
    feedback.value = `Serviço “${serviceName}” ${action === 'start' ? 'iniciado' : action === 'stop' ? 'parado' : 'reiniciado'} com sucesso.`;
    await load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível executar a ação.';
  } finally {
    activeService.value = '';
  }
}

async function confirmPending(): Promise<void> {
  const pending = pendingConfirmation.value;
  if (!pending) return;
  await execute(pending.serviceName, pending.action, pending.token);
}

function cancelPending(): void {
  pendingConfirmation.value = undefined;
  feedback.value = '';
}

async function showLogs(serviceName: string): Promise<void> {
  const requestedProjectId = props.project.id;
  const requestGeneration = ++logsGeneration;
  logsLoading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchComposeServiceLogs(requestedProjectId, serviceName);
    if (props.project.id === requestedProjectId && requestGeneration === logsGeneration) {
      logs.value = result;
    }
  } catch (error) {
    if (props.project.id === requestedProjectId && requestGeneration === logsGeneration) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar os logs.';
    }
  } finally {
    if (props.project.id === requestedProjectId && requestGeneration === logsGeneration) {
      logsLoading.value = false;
    }
  }
}

async function showBuildLogs(serviceName: string): Promise<void> {
  const requestedProjectId = props.project.id;
  const requestGeneration = ++logsGeneration;
  logsLoading.value = true;
  errorMessage.value = '';
  try {
    const log = await fetchComposeServiceBuildLog(requestedProjectId, serviceName);
    if (props.project.id === requestedProjectId && requestGeneration === logsGeneration) {
      logs.value = { serviceName: `${serviceName} (build)`, ...log };
    }
  } catch (error) {
    if (props.project.id === requestedProjectId && requestGeneration === logsGeneration) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar os logs do build.';
    }
  } finally {
    if (props.project.id === requestedProjectId && requestGeneration === logsGeneration) {
      logsLoading.value = false;
    }
  }
}

watch(() => props.project.id, () => {
  stopBuildPolling();
  logsGeneration += 1;
  overview.value = undefined;
  logs.value = undefined;
  logsLoading.value = false;
  pendingConfirmation.value = undefined;
  pendingBuildConfirmation.value = undefined;
  builds.value = {};
  void load();
}, { immediate: true });

onBeforeUnmount(() => {
  stopBuildPolling();
});
</script>

<template>
  <Card class="docker-panel">
    <template #header>
      <div class="docker-panel-heading">
        <div>
          <span>Infraestrutura local</span>
          <h3>Docker Compose</h3>
          <p v-if="overview?.composeFile">{{ overview.composeFile }}</p>
        </div>
        <button class="secondary-button" type="button" :disabled="loading" @click="load">
          <ArrowPathIcon aria-hidden="true" />
          Atualizar
        </button>
      </div>
    </template>

    <div v-if="loading" class="docker-empty">Consultando serviços declarados…</div>
    <div v-else-if="!overview?.configured" class="docker-empty">
      Nenhum arquivo Docker Compose reconhecido na raiz do projeto.
    </div>
    <div v-else class="docker-content">
      <p v-if="!overview.dockerAvailable" class="docker-warning">
        Docker Compose não está disponível no PATH da API. Os serviços podem ser consultados, mas as ações estão desabilitadas.
      </p>
      <p v-if="errorMessage" class="docker-error" role="alert">{{ errorMessage }}</p>
      <p v-if="feedback" class="docker-feedback" role="status">{{ feedback }}</p>

      <div v-if="pendingConfirmation" class="docker-confirmation">
        <strong>Confirmar {{ pendingConfirmation.action === 'stop' ? 'parada' : 'reinício' }}</strong>
        <span>Serviço: {{ pendingConfirmation.serviceName }}</span>
        <div>
          <button class="danger-button" type="button" :disabled="Boolean(activeService)" @click="confirmPending">Confirmar</button>
          <button class="secondary-button" type="button" :disabled="Boolean(activeService)" @click="cancelPending">Cancelar</button>
        </div>
      </div>

      <div v-if="pendingBuildConfirmation" class="docker-confirmation">
        <strong>Confirmar build</strong>
        <span>Serviço: {{ pendingBuildConfirmation.serviceName }}</span>
        <div>
          <button class="danger-button" type="button" :disabled="Boolean(activeService)" @click="confirmPendingBuild">Confirmar</button>
          <button class="secondary-button" type="button" :disabled="Boolean(activeService)" @click="cancelPendingBuild">Cancelar</button>
        </div>
      </div>

      <div class="docker-service-list">
        <article v-for="service in services" :key="service.name" class="docker-service-card">
          <header>
            <div>
              <h4>{{ service.name }}</h4>
              <code>{{ service.image ?? 'imagem definida por build' }}</code>
            </div>
            <StatusBadge :tone="service.running ? 'success' : isBuilding(service.name) ? 'warning' : buildStatus(service.name)?.status === 'failed' ? 'danger' : service.requiresBuild ? 'warning' : 'neutral'">
              {{ service.running ? 'Rodando'
                : isBuilding(service.name) ? 'Buildando'
                : buildStatus(service.name)?.status === 'failed' ? 'Build falhou'
                : service.requiresBuild && !canStartService(service) ? 'Requer build'
                : service.requiresBuild ? 'Build concluído'
                : 'Parado' }}
            </StatusBadge>
          </header>
          <dl>
            <div><dt>Portas</dt><dd>{{ service.ports.join(', ') || '—' }}</dd></div>
            <div><dt>Dependências</dt><dd>{{ service.dependsOn.join(', ') || '—' }}</dd></div>
          </dl>
          <footer>
            <button class="secondary-button" type="button" :disabled="!overview.dockerAvailable || !canStartService(service) || Boolean(activeService)" @click="run(service, 'start')">
              <PlayIcon aria-hidden="true" /> Iniciar
            </button>
            <button class="secondary-button" type="button" :disabled="!overview.dockerAvailable || !service.running || Boolean(activeService)" @click="run(service, 'stop')">
              <PauseIcon aria-hidden="true" /> Parar
            </button>
            <button class="secondary-button" type="button" :disabled="!overview.dockerAvailable || !service.running || Boolean(activeService)" @click="run(service, 'restart')">
              <ArrowPathIcon aria-hidden="true" /> Reiniciar
            </button>
            <button v-if="service.requiresBuild" class="secondary-button" type="button" :disabled="!overview.dockerAvailable || isBuilding(service.name) || Boolean(activeService)" @click="requestBuild(service.name)">
              <WrenchIcon aria-hidden="true" /> {{ isBuilding(service.name) ? 'Buildando…' : 'Buildar' }}
            </button>
            <button class="secondary-button" type="button" :disabled="!overview.dockerAvailable || logsLoading" @click="showLogs(service.name)">
              <CommandLineIcon aria-hidden="true" /> Logs
            </button>
            <button v-if="buildStatus(service.name)" class="secondary-button" type="button" :disabled="logsLoading" @click="showBuildLogs(service.name)">
              <CommandLineIcon aria-hidden="true" /> Logs do build
            </button>
          </footer>
        </article>
      </div>

      <section v-if="logs" class="docker-logs" aria-label="Logs do serviço">
        <header>
          <div><span>Logs recentes</span><strong>{{ logs.serviceName }}</strong></div>
          <button class="icon-button" type="button" aria-label="Fechar logs" @click="logs = undefined"><XMarkIcon aria-hidden="true" /></button>
        </header>
        <p v-if="logs.masked" class="docker-warning">{{ logs.redactionCount }} conteúdo(s) sensível(is) mascarado(s).</p>
        <p v-if="logs.truncated" class="docker-warning">A saída foi limitada aos dados mais recentes.</p>
        <pre>{{ logs.content || 'Nenhum log recente.' }}</pre>
      </section>
    </div>
  </Card>
</template>

<style scoped>
.docker-panel, .docker-content { display: grid; gap: 16px; }
.docker-panel-heading, .docker-service-card header, .docker-service-card footer, .docker-logs header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.docker-panel-heading span, .docker-logs span { color: var(--text-muted); font-size: var(--font-xs); font-weight: var(--font-weight-strong); text-transform: uppercase; }
.docker-panel-heading h3 { margin: 4px 0; font-size: var(--font-lg); }
.docker-panel-heading p { margin: 0; color: var(--text-muted); font-size: var(--font-xs); }
.docker-panel-heading svg, .docker-service-card button svg { width: 16px; height: 16px; }
.docker-empty { min-height: 180px; display: grid; place-items: center; padding: 24px; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); color: var(--text-muted); text-align: center; }
.docker-warning, .docker-error, .docker-feedback { margin: 0; padding: 10px 12px; border-radius: var(--radius-sm); font-size: var(--font-xs); }
.docker-warning { color: var(--warning-text); background: var(--warning-surface); }
.docker-error { color: var(--danger-text); background: var(--danger-surface); }
.docker-feedback { color: var(--success-text); background: var(--success-surface); }
.docker-service-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.docker-service-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-1); }
.docker-service-card h4 { margin: 0 0 5px; font-size: var(--font-md); }
.docker-service-card code { color: var(--text-muted); font-size: var(--font-xs); }
.docker-service-card dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
.docker-service-card dt { color: var(--text-muted); font-size: var(--font-xs); text-transform: uppercase; }
.docker-service-card dd { margin: 4px 0 0; color: var(--text); font-size: var(--font-sm); overflow-wrap: anywhere; }
.docker-service-card footer { justify-content: flex-start; flex-wrap: wrap; }
.docker-confirmation { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--warning-text); border-radius: var(--radius-md); background: var(--warning-surface); }
.docker-confirmation div { display: flex; gap: 8px; }
.docker-logs { display: grid; gap: 10px; }
.docker-logs strong { display: block; margin-top: 3px; }
.docker-logs pre { overflow: auto; max-height: 420px; margin: 0; padding: 14px; border-radius: var(--radius-md); color: var(--text); background: var(--surface-0); font-size: var(--font-xs); white-space: pre-wrap; }
.docker-logs .icon-button svg { width: 18px; height: 18px; }
@media (max-width: 820px) { .docker-service-list { grid-template-columns: 1fr; } .docker-panel-heading { align-items: flex-start; } }
</style>
