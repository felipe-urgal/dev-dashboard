<script setup lang="ts">
import type {
  Stack,
  StackCheck,
  StackNode,
  StackNodeHealth,
  StackNodeState,
} from '@dev-dashboard/contracts';
import {
  ArrowPathIcon,
  ArrowUturnRightIcon,
  CircleStackIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/vue/24/outline';
import { computed, onMounted, ref } from 'vue';

import {
  fetchStackCheck,
  fetchStacks,
  restartStackNode,
  startStack,
  stopStack,
} from '../api/stacks';
import EmptyState from '../components/EmptyState.vue';
import StatusBadge from '../components/StatusBadge.vue';
import type { StatusBadgeTone } from '../components/status-badge-types';
import { dashboardStore } from '../stores/dashboard';

const stacks = ref<Stack[]>([]);
const checks = ref(new Map<string, StackCheck>());
const loading = ref(false);
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
        nameById.get(dependency.dependsOnNodeId) ??
        dependency.dependsOnNodeId,
    );
}

function canRestart(node: StackNode): boolean {
  return node.target.kind === 'compose-service';
}

function setCheck(check: StackCheck): void {
  checks.value = new Map(checks.value).set(check.stack.id, check);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const definitions = await fetchStacks();
    stacks.value = definitions;

    const results = await Promise.allSettled(
      definitions.map((stack) => fetchStackCheck(stack.id)),
    );
    const next = new Map<string, StackCheck>();
    for (let index = 0; index < definitions.length; index += 1) {
      const result = results[index];
      if (result?.status === 'fulfilled') {
        next.set(definitions[index]!.id, result.value);
      }
    }
    checks.value = next;
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
    setCheck(await fetchStackCheck(stackId));
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar a Stack.';
  } finally {
    refreshingStackId.value = '';
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
        <ArrowPathIcon
          :class="{ 'is-spinning': loading }"
          aria-hidden="true"
        />
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
              class="stack-button stack-button-primary"
              type="button"
              :disabled="Boolean(action)"
              @click="
                mutate(`start-${stack.id}`, () => startStack(stack.id))
              "
            >
              <PlayIcon aria-hidden="true" />
              {{
                action === `start-${stack.id}` ? 'Iniciando…' : 'Iniciar'
              }}
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

.stack-node-action {
  min-width: 92px;
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
