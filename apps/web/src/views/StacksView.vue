<script setup lang="ts">
import type {
  Stack,
  StackCheck,
  StackDependencyDiscovery,
  StackDependencySuggestion,
  StackLogsSnapshot,
  StackNode,
  StackNodeHealth,
  StackNodeState,
} from '@dev-dashboard/contracts';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnRightIcon,
  CircleStackIcon,
  DocumentTextIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/vue/24/outline';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import {
  fetchStackCheck,
  fetchStackDependencySuggestions,
  fetchStackLogs,
  fetchStacks,
  restartStackNode,
  saveStack,
  startStack,
  stopStack,
} from '../api/stacks';
import EmptyState from '../components/EmptyState.vue';
import StatusBadge from '../components/StatusBadge.vue';
import type { StatusBadgeTone } from '../components/status-badge-types';
import { dashboardStore } from '../stores/dashboard';

const stacks = ref<Stack[]>([]);
const checks = ref(new Map<string, StackCheck>());
const discoveries = ref(new Map<string, StackDependencyDiscovery>());
const logs = ref(new Map<string, StackLogsSnapshot>());
const loading = ref(false);
const loadingLogsStackId = ref('');
const refreshingStackId = ref('');
const action = ref('');
const errorMessage = ref('');

const projectNameById = computed(
  () =>
    new Map(
      dashboardStore.knownProjects.value.map((project) => [
        project.id,
        project.name,
      ]),
    ),
);

function projectName(projectId: string): string {
  return projectNameById.value.get(projectId) ?? projectId;
}

function checkFor(stackId: string): StackCheck | undefined {
  return checks.value.get(stackId);
}

function discoveryFor(stackId: string): StackDependencyDiscovery | undefined {
  return discoveries.value.get(stackId);
}

function logsFor(stackId: string): StackLogsSnapshot | undefined {
  return logs.value.get(stackId);
}

function setLogs(snapshot: StackLogsSnapshot): void {
  logs.value = new Map(logs.value).set(snapshot.stackId, snapshot);
}

function nodeName(stack: Stack, nodeId: string): string {
  return stack.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function healthFor(
  stackId: string,
  nodeId: string,
): StackNodeHealth | undefined {
  return checkFor(stackId)?.health.nodes.find((node) => node.nodeId === nodeId);
}

function stateTone(state?: StackNodeState): StatusBadgeTone {
  if (state === 'ready') return 'success';
  if (state === 'starting') return 'info';
  if (state === 'blocked') return 'warning';
  if (state === 'failed') return 'danger';
  return 'neutral';
}

function stateLabel(state?: StackNodeState): string {
  if (state === 'ready') return 'Pronto';
  if (state === 'starting') return 'Iniciando';
  if (state === 'stopped') return 'Parado';
  if (state === 'blocked') return 'Bloqueado';
  if (state === 'failed') return 'Falhou';
  return 'Desconhecido';
}

function targetLabel(node: StackNode): string {
  if (node.target.kind === 'compose-service') {
    return `${projectName(node.target.projectId)} · Compose · ${node.target.service}`;
  }
  if (node.target.kind === 'process') {
    return `${projectName(node.target.projectId)} · Processo · ${node.target.processId}`;
  }
  if (node.target.kind === 'health-check') {
    return `${projectName(node.target.projectId)} · Health check · ${node.target.checkId}`;
  }
  return `${projectName(node.target.projectId)} · Ambiente`;
}

function dependenciesFor(stack: Stack, nodeId: string): string[] {
  const nameById = new Map(stack.nodes.map((node) => [node.id, node.name]));
  return stack.dependencies
    .filter((dependency) => dependency.nodeId === nodeId)
    .map(
      (dependency) =>
        nameById.get(dependency.dependsOnNodeId) ?? dependency.dependsOnNodeId,
    );
}

function canRestart(node: StackNode): boolean {
  return node.target.kind === 'compose-service';
}

function nodeDestination(node: StackNode) {
  const params = { projectId: node.target.projectId };
  const environmentInstanceId =
    'environmentInstanceId' in node.target
      ? node.target.environmentInstanceId
      : undefined;
  const query = environmentInstanceId ? { environmentInstanceId } : undefined;

  if (node.target.kind === 'compose-service') {
    return { name: 'project-compose', params, ...(query ? { query } : {}) };
  }

  if (node.target.kind === 'health-check') {
    return { name: 'project-server', params, ...(query ? { query } : {}) };
  }

  return { name: 'project-details', params, ...(query ? { query } : {}) };
}

function nodeDestinationLabel(node: StackNode): string {
  if (node.target.kind === 'compose-service') return 'Abrir Compose';
  if (node.target.kind === 'health-check') return 'Abrir servidor';
  return 'Abrir projeto';
}

function setCheck(check: StackCheck): void {
  checks.value = new Map(checks.value).set(check.stack.id, check);
}

function setDiscovery(discovery: StackDependencyDiscovery): void {
  discoveries.value = new Map(discoveries.value).set(
    discovery.stackId,
    discovery,
  );
}

function replaceStack(stack: Stack): void {
  stacks.value = stacks.value.map((current) =>
    current.id === stack.id ? stack : current,
  );
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const definitions = await fetchStacks();
    stacks.value = definitions;

    const [checkResults, discoveryResults] = await Promise.all([
      Promise.allSettled(definitions.map((stack) => fetchStackCheck(stack.id))),
      Promise.allSettled(
        definitions.map((stack) => fetchStackDependencySuggestions(stack.id)),
      ),
    ]);
    const nextChecks = new Map<string, StackCheck>();
    const nextDiscoveries = new Map<string, StackDependencyDiscovery>();
    for (let index = 0; index < definitions.length; index += 1) {
      const checkResult = checkResults[index];
      if (checkResult?.status === 'fulfilled') {
        nextChecks.set(definitions[index]!.id, checkResult.value);
      }

      const discoveryResult = discoveryResults[index];
      if (discoveryResult?.status === 'fulfilled') {
        nextDiscoveries.set(definitions[index]!.id, discoveryResult.value);
      }
    }
    checks.value = nextChecks;
    discoveries.value = nextDiscoveries;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar as Stacks.';
  } finally {
    loading.value = false;
  }
}

async function refreshStack(stackId: string): Promise<void> {
  if (refreshingStackId.value || action.value) return;

  refreshingStackId.value = stackId;
  errorMessage.value = '';
  try {
    const [check, discovery] = await Promise.all([
      fetchStackCheck(stackId),
      fetchStackDependencySuggestions(stackId),
    ]);
    setCheck(check);
    setDiscovery(discovery);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar a Stack.';
  } finally {
    refreshingStackId.value = '';
  }
}


async function loadStackLogs(stackId: string): Promise<void> {
  if (loadingLogsStackId.value) return;

  loadingLogsStackId.value = stackId;
  errorMessage.value = '';
  try {
    setLogs(await fetchStackLogs(stackId));
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os logs da Stack.';
  } finally {
    loadingLogsStackId.value = '';
  }
}

async function acceptSuggestion(
  stack: Stack,
  suggestion: StackDependencySuggestion,
): Promise<void> {
  if (action.value) return;

  action.value = `dependency-${stack.id}-${suggestion.dependency.nodeId}-${suggestion.dependency.dependsOnNodeId}`;
  errorMessage.value = '';
  try {
    const saved = await saveStack({
      ...stack,
      dependencies: [...stack.dependencies, suggestion.dependency],
    });
    replaceStack(saved);

    const [check, discovery] = await Promise.all([
      fetchStackCheck(saved.id),
      fetchStackDependencySuggestions(saved.id),
    ]);
    setCheck(check);
    setDiscovery(discovery);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'A dependência sugerida não pôde ser adicionada.';
  } finally {
    action.value = '';
  }
}

async function mutate(
  operation: string,
  callback: () => Promise<{ check: StackCheck }>,
): Promise<void> {
  if (action.value) return;

  action.value = operation;
  errorMessage.value = '';
  try {
    const result = await callback();
    setCheck(result.check);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'A operação da Stack não pôde ser concluída.';
  } finally {
    action.value = '';
  }
}

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
  void load();
});
</script>

<template>
  <section class="stacks-page" aria-label="Stacks multi-projeto">
    <header class="stacks-header">
      <div>
        <span>Orquestração local</span>
        <h1>Stacks</h1>
        <p>Topologia, estado e lifecycle coordenado entre projetos.</p>
      </div>

      <button
        class="stack-button"
        type="button"
        :disabled="loading || Boolean(action)"
        @click="load"
      >
        <ArrowPathIcon :class="{ 'is-spinning': loading }" aria-hidden="true" />
        Atualizar
      </button>
    </header>

    <p v-if="errorMessage" class="stacks-error" role="alert">
      {{ errorMessage }}
    </p>

    <EmptyState
      v-if="loading && stacks.length === 0"
      icon="•••"
      title="Carregando Stacks"
      description="Lendo definições, topologia e estado atual."
    />

    <EmptyState
      v-else-if="stacks.length === 0"
      icon="◇"
      title="Nenhuma Stack definida"
      description="As Stacks confirmadas no backend aparecerão aqui para inspeção e lifecycle."
    />

    <div v-else class="stack-list">
      <article
        v-for="stack in stacks"
        :key="stack.id"
        class="stack-card"
        :aria-labelledby="`stack-${stack.id}-title`"
      >
        <header class="stack-card-header">
          <div class="stack-title-group">
            <span class="stack-icon" aria-hidden="true">
              <CircleStackIcon />
            </span>
            <div>
              <div class="stack-title-row">
                <h2 :id="`stack-${stack.id}-title`">{{ stack.name }}</h2>
                <StatusBadge
                  :tone="stateTone(checkFor(stack.id)?.health.state)"
                >
                  {{ stateLabel(checkFor(stack.id)?.health.state) }}
                </StatusBadge>
              </div>
              <p>
                {{ stack.nodes.length }} node(s) ·
                {{ stack.dependencies.length }} dependência(s)
              </p>
            </div>
          </div>

          <div class="stack-actions">
            <button
              class="stack-icon-button"
              type="button"
              :aria-label="`Atualizar ${stack.name}`"
              :title="`Atualizar ${stack.name}`"
              :disabled="Boolean(action) || Boolean(refreshingStackId)"
              @click="refreshStack(stack.id)"
            >
              <ArrowPathIcon
                :class="{ 'is-spinning': refreshingStackId === stack.id }"
                aria-hidden="true"
              />
            </button>
            <button
              class="stack-button"
              type="button"
              :disabled="Boolean(action) || Boolean(loadingLogsStackId)"
              @click="loadStackLogs(stack.id)"
            >
              <DocumentTextIcon aria-hidden="true" />
              {{
                loadingLogsStackId === stack.id
                  ? 'Carregando logs…'
                  : logsFor(stack.id)
                    ? 'Atualizar logs'
                    : 'Ver logs'
              }}
            </button>
            <button
              class="stack-button stack-button-primary"
              type="button"
              :disabled="Boolean(action)"
              @click="mutate(`start-${stack.id}`, () => startStack(stack.id))"
            >
              <PlayIcon aria-hidden="true" />
              {{ action === `start-${stack.id}` ? 'Iniciando…' : 'Iniciar' }}
            </button>
            <button
              class="stack-button stack-button-danger"
              type="button"
              :disabled="Boolean(action)"
              @click="mutate(`stop-${stack.id}`, () => stopStack(stack.id))"
            >
              <PauseIcon aria-hidden="true" />
              {{ action === `stop-${stack.id}` ? 'Parando…' : 'Parar' }}
            </button>
          </div>
        </header>

        <div
          v-if="checkFor(stack.id)"
          class="stack-order"
          aria-label="Ordem topológica"
        >
          <span>Start</span>
          <code>{{ checkFor(stack.id)?.topology.startOrder.join(' → ') }}</code>
          <span>Stop</span>
          <code>{{ checkFor(stack.id)?.topology.stopOrder.join(' → ') }}</code>
        </div>
        <div v-else class="stack-check-unavailable" role="status">
          Estado atual indisponível. Atualize esta Stack para tentar novamente.
        </div>


        <section
          v-if="logsFor(stack.id)"
          class="stack-logs"
          aria-label="Logs agregados da Stack"
        >
          <div class="stack-logs-header">
            <div>
              <strong>Logs</strong>
              <small>
                Leitura consolidada dos domínios proprietários. Sem novo
                streaming ou persistência.
              </small>
            </div>
            <span>{{ logsFor(stack.id)?.nodes.length }} node(s)</span>
          </div>

          <article
            v-for="nodeLog in logsFor(stack.id)?.nodes ?? []"
            :key="`${stack.id}-log-${nodeLog.nodeId}`"
            class="stack-log-node"
          >
            <div class="stack-log-node-header">
              <div>
                <strong>{{ nodeName(stack, nodeLog.nodeId) }}</strong>
                <small>
                  {{
                    nodeLog.source === 'compose'
                      ? 'Docker Compose'
                      : nodeLog.source === 'process'
                        ? 'Process Manager'
                        : 'Sem stream de log'
                  }}
                </small>
              </div>
              <StatusBadge
                :tone="
                  nodeLog.state === 'available'
                    ? 'success'
                    : nodeLog.state === 'unavailable'
                      ? 'warning'
                      : 'neutral'
                "
              >
                {{
                  nodeLog.state === 'available'
                    ? 'Disponível'
                    : nodeLog.state === 'empty'
                      ? 'Vazio'
                      : nodeLog.state === 'unsupported'
                        ? 'Não aplicável'
                        : 'Indisponível'
                }}
              </StatusBadge>
            </div>

            <pre v-if="nodeLog.content" class="stack-log-content">{{
              nodeLog.content
            }}</pre>
            <p v-else-if="nodeLog.diagnostic" class="stack-log-diagnostic">
              {{ nodeLog.diagnostic }}
            </p>

            <small
              v-if="
                nodeLog.state === 'available' &&
                (nodeLog.truncated || nodeLog.masked)
              "
              class="stack-log-meta"
            >
              <template v-if="nodeLog.truncated">Saída limitada.</template>
              <template v-if="nodeLog.masked">
                Conteúdo sensível mascarado{{
                  nodeLog.redactionCount
                    ? ` (${nodeLog.redactionCount} ocorrência(s))`
                    : ''
                }}.
              </template>
            </small>
          </article>
        </section>

        <section
          v-if="discoveryFor(stack.id)?.suggestions.length"
          class="stack-suggestions"
          aria-label="Sugestões de dependência"
        >
          <div class="stack-suggestions-header">
            <div>
              <strong>Sugestões de dependência</strong>
              <small>
                Detectadas por evidência explícita. Nada é salvo
                automaticamente.
              </small>
            </div>
            <span>{{ discoveryFor(stack.id)?.suggestions.length }}</span>
          </div>

          <article
            v-for="suggestion in discoveryFor(stack.id)?.suggestions ?? []"
            :key="`${suggestion.dependency.nodeId}-${suggestion.dependency.dependsOnNodeId}`"
            class="stack-suggestion"
          >
            <div>
              <strong>
                {{ nodeName(stack, suggestion.dependency.nodeId) }}
                depende de
                {{ nodeName(stack, suggestion.dependency.dependsOnNodeId) }}
              </strong>
              <small>
                Docker Compose · {{ suggestion.evidence.service }} depends_on
                {{ suggestion.evidence.dependsOnService }}
              </small>
            </div>
            <button
              class="stack-node-action"
              type="button"
              :disabled="Boolean(action)"
              @click="acceptSuggestion(stack, suggestion)"
            >
              {{
                action ===
                `dependency-${stack.id}-${suggestion.dependency.nodeId}-${suggestion.dependency.dependsOnNodeId}`
                  ? 'Adicionando…'
                  : 'Adicionar'
              }}
            </button>
          </article>
        </section>

        <div class="stack-node-list">
          <article
            v-for="node in stack.nodes"
            :key="node.id"
            class="stack-node"
          >
            <div class="stack-node-main">
              <div class="stack-node-title">
                <strong>{{ node.name }}</strong>
                <StatusBadge
                  :tone="stateTone(healthFor(stack.id, node.id)?.state)"
                >
                  {{ stateLabel(healthFor(stack.id, node.id)?.state) }}
                </StatusBadge>
              </div>
              <p>{{ targetLabel(node) }}</p>
              <small v-if="dependenciesFor(stack, node.id).length">
                Depende de:
                {{ dependenciesFor(stack, node.id).join(', ') }}
              </small>
              <small
                v-if="healthFor(stack.id, node.id)?.diagnostic"
                class="stack-node-diagnostic"
              >
                {{ healthFor(stack.id, node.id)?.diagnostic }}
              </small>
            </div>

            <div class="stack-node-actions">
              <RouterLink class="stack-node-action" :to="nodeDestination(node)">
                <ArrowTopRightOnSquareIcon aria-hidden="true" />
                {{ nodeDestinationLabel(node) }}
              </RouterLink>

              <button
                v-if="canRestart(node)"
                class="stack-node-action"
                type="button"
                :disabled="Boolean(action)"
                @click="
                  mutate(`restart-${stack.id}-${node.id}`, () =>
                    restartStackNode(stack.id, node.id),
                  )
                "
              >
                <ArrowUturnRightIcon aria-hidden="true" />
                {{
                  action === `restart-${stack.id}-${node.id}`
                    ? 'Reiniciando…'
                    : 'Reiniciar'
                }}
              </button>
            </div>
          </article>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.stacks-page {
  display: grid;
  gap: 18px;
  min-height: 100vh;
  padding: 28px;
  background: var(--surface-0);
}

.stacks-header,
.stack-card-header,
.stack-title-row,
.stack-actions,
.stack-node-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stacks-header {
  align-items: flex-start;
}

.stacks-header > div {
  display: grid;
  gap: 4px;
}

.stacks-header span {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stacks-header h1,
.stacks-header p,
.stack-title-group h2,
.stack-title-group p,
.stack-node p {
  margin: 0;
}

.stacks-header h1 {
  font-size: 32px;
  letter-spacing: -0.04em;
}

.stacks-header p,
.stack-title-group p,
.stack-node p,
.stack-node small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.stacks-error,
.stack-check-unavailable {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
}

.stacks-error {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.stack-check-unavailable {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.stack-list {
  display: grid;
  gap: 12px;
}

.stack-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.stack-title-group {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.stack-title-group > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.stack-title-row {
  justify-content: flex-start;
}

.stack-title-group h2 {
  font-size: 18px;
}

.stack-icon {
  display: flex;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--accent);
  background: var(--accent-soft);
}

.stack-icon svg,
.stack-button svg,
.stack-icon-button svg,
.stack-node-action svg {
  width: 16px;
  height: 16px;
}

.stack-actions {
  justify-content: flex-end;
}

.stack-button,
.stack-icon-button,
.stack-node-action {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 7px 11px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.stack-icon-button {
  width: 34px;
  padding: 0;
}

.stack-button:hover:not(:disabled),
.stack-icon-button:hover:not(:disabled),
.stack-node-action:hover:not(:disabled) {
  border-color: var(--accent);
}

.stack-button:disabled,
.stack-icon-button:disabled,
.stack-node-action:disabled {
  cursor: wait;
  opacity: 0.58;
}

.stack-button-primary {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.stack-button-danger {
  color: var(--danger-text);
}

.stack-order {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.stack-order span {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.stack-order code {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}


.stack-logs {
  display: grid;
  gap: 8px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.stack-logs-header,
.stack-log-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stack-logs-header > div,
.stack-log-node-header > div {
  display: grid;
  gap: 3px;
}

.stack-logs-header small,
.stack-log-node-header small,
.stack-log-meta {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.stack-logs-header > span {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 800;
}

.stack-log-node {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.stack-log-content {
  max-height: 240px;
  margin: 0;
  overflow: auto;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.stack-log-diagnostic {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.stack-log-meta {
  display: flex;
  gap: 6px;
}

.stack-suggestions {
  display: grid;
  gap: 8px;
  padding: 11px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.stack-suggestions-header,
.stack-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stack-suggestions-header > div,
.stack-suggestion > div {
  display: grid;
  gap: 3px;
}

.stack-suggestions-header small,
.stack-suggestion small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.stack-suggestions-header > span {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 10px;
  font-weight: 800;
  text-align: center;
}

.stack-node-list {
  display: grid;
  gap: 7px;
}

.stack-node {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.stack-node-main {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.stack-node-title {
  justify-content: flex-start;
}

.stack-node-diagnostic {
  color: var(--warning-text) !important;
}

.stack-node-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.stack-node-action {
  min-width: 92px;
  text-decoration: none;
}

.is-spinning {
  animation: stacks-spin 800ms linear infinite;
}

@keyframes stacks-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .stacks-page {
    padding: 20px 14px 28px;
  }

  .stacks-header,
  .stack-card-header {
    align-items: stretch;
    flex-direction: column;
  }

  .stack-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .stack-node {
    grid-template-columns: 1fr;
  }

  .stack-suggestion {
    align-items: flex-start;
    flex-direction: column;
  }

  .stack-node-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .stack-node-action {
    width: fit-content;
  }

  .stack-order {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}
</style>
