<script setup lang="ts">
import type {
  Stack,
  StackDependency,
  StackNode,
  StackResource,
} from '@dev-dashboard/contracts';
import { computed, ref } from 'vue';

const props = defineProps<{
  resources: StackResource[];
  initial?: Stack;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  save: [definition: Stack];
  cancel: [];
}>();

const name = ref(props.initial?.name ?? '');
const nodes = ref<StackNode[]>(
  props.initial?.nodes.map((node) => ({
    ...node,
    target: { ...node.target },
  })) ?? [],
);
const dependencies = ref<StackDependency[]>(
  props.initial?.dependencies.map((dependency) => ({ ...dependency })) ?? [],
);
const resourceIndex = ref('');
const dependentId = ref('');
const requirementId = ref('');
const error = ref('');

const availableResources = computed(() =>
  props.resources
    .map((resource, index) => ({ ...resource, index }))
    .filter(
      ({ target }) =>
        !nodes.value.some(
          (node) => JSON.stringify(node.target) === JSON.stringify(target),
        ),
    ),
);

function addNode(): void {
  const index = Number(resourceIndex.value);
  const resource =
    resourceIndex.value !== '' && Number.isInteger(index)
      ? props.resources[index]
      : undefined;
  if (
    !resource ||
    nodes.value.some(
      (node) => JSON.stringify(node.target) === JSON.stringify(resource.target),
    )
  ) {
    error.value = 'Selecione um recurso disponível no catálogo atualizado.';
    return;
  }
  nodes.value.push({
    id: crypto.randomUUID(),
    name: resource.name.slice(0, 240),
    target: { ...resource.target },
  });
  resourceIndex.value = '';
  error.value = '';
}

function removeNode(id: string): void {
  nodes.value = nodes.value.filter((node) => node.id !== id);
  dependencies.value = dependencies.value.filter(
    (dependency) =>
      dependency.nodeId !== id && dependency.dependsOnNodeId !== id,
  );
}

function addDependency(): void {
  if (
    !dependentId.value ||
    !requirementId.value ||
    dependentId.value === requirementId.value ||
    !nodes.value.some((node) => node.id === dependentId.value) ||
    !nodes.value.some((node) => node.id === requirementId.value) ||
    dependencies.value.some(
      (dependency) =>
        dependency.nodeId === dependentId.value &&
        dependency.dependsOnNodeId === requirementId.value,
    )
  ) {
    error.value =
      'Escolha dois nodes diferentes e uma dependência ainda não adicionada.';
    return;
  }
  dependencies.value.push({
    nodeId: dependentId.value,
    dependsOnNodeId: requirementId.value,
  });
  dependentId.value = '';
  requirementId.value = '';
  error.value = '';
}

function nodeName(id: string): string {
  return nodes.value.find((node) => node.id === id)?.name ?? id;
}

function submit(): void {
  const normalized = name.value.trim();
  if (!normalized || normalized.length > 240 || nodes.value.length === 0) {
    error.value =
      'Informe um nome e selecione pelo menos um recurso conhecido.';
    return;
  }
  error.value = '';
  emit('save', {
    id: props.initial?.id ?? crypto.randomUUID(),
    name: normalized,
    nodes: nodes.value.map((node) => ({
      ...node,
      target: { ...node.target },
    })),
    dependencies: dependencies.value.map((dependency) => ({ ...dependency })),
  });
}
</script>

<template>
  <form
    class="stack-definition-editor"
    aria-label="Editar definição e topologia da Stack"
    @submit.prevent="submit"
  >
    <h3>{{ initial ? 'Editar definição' : 'Criar Stack' }}</h3>
    <label>
      Nome da Stack
      <input
        v-model="name"
        maxlength="240"
        required
        :disabled="disabled"
        aria-label="Nome da Stack"
      />
    </label>
    <p v-if="error" role="alert">{{ error }}</p>

    <div class="resource-controls">
      <label>
        Recurso conhecido do backend
        <select
          v-model="resourceIndex"
          :disabled="disabled || !availableResources.length"
        >
          <option value="">Selecione um recurso</option>
          <option
            v-for="resource in availableResources"
            :key="resource.index"
            :value="String(resource.index)"
          >
            {{ resource.name }}
          </option>
        </select>
      </label>
      <button
        type="button"
        :disabled="disabled || !resourceIndex"
        @click="addNode"
      >
        Adicionar node
      </button>
    </div>

    <ul class="editor-list" aria-label="Nodes selecionados">
      <li v-for="node in nodes" :key="node.id">
        <span>{{ node.name }}</span>
        <button type="button" :disabled="disabled" @click="removeNode(node.id)">
          Remover node
        </button>
      </li>
    </ul>
    <p v-if="!nodes.length">
      Selecione um recurso. Nenhum caminho ou comando pode ser informado.
    </p>

    <fieldset :disabled="disabled || nodes.length < 2">
      <legend>Dependências explícitas (sem salvamento automático)</legend>
      <label>
        Node dependente
        <select v-model="dependentId">
          <option value="">Selecione</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>
      </label>
      <label>
        Depende de
        <select v-model="requirementId">
          <option value="">Selecione</option>
          <option
            v-for="node in nodes"
            :key="node.id"
            :value="node.id"
            :disabled="node.id === dependentId"
          >
            {{ node.name }}
          </option>
        </select>
      </label>
      <button type="button" @click="addDependency">
        Adicionar dependência
      </button>
    </fieldset>
    <ul class="editor-list" aria-label="Dependências selecionadas">
      <li
        v-for="dependency in dependencies"
        :key="dependency.nodeId + ':' + dependency.dependsOnNodeId"
      >
        <span>
          {{ nodeName(dependency.nodeId) }} depende de
          {{ nodeName(dependency.dependsOnNodeId) }}
        </span>
        <button
          type="button"
          :disabled="disabled"
          @click="
            dependencies = dependencies.filter((item) => item !== dependency)
          "
        >
          Remover dependência
        </button>
      </li>
    </ul>
    <p>
      O backend valida a topologia, as referências e a revisão antes de
      persistir.
    </p>
    <div class="editor-actions">
      <button type="submit" :disabled="disabled || !nodes.length">
        Salvar definição
      </button>
      <button type="button" :disabled="disabled" @click="emit('cancel')">
        Cancelar
      </button>
    </div>
  </form>
</template>

<style scoped>
.stack-definition-editor {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.stack-definition-editor h3,
.stack-definition-editor p {
  margin: 0;
}

.stack-definition-editor label {
  display: grid;
  gap: 5px;
}

.stack-definition-editor input,
.stack-definition-editor select {
  min-width: 0;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-0);
}

.resource-controls,
.editor-actions,
.editor-list li {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.resource-controls label {
  flex: 1 1 220px;
}

.editor-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
}

.editor-list li {
  justify-content: space-between;
}

.stack-definition-editor fieldset {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--border);
}

.stack-definition-editor button {
  cursor: pointer;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.stack-definition-editor button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
