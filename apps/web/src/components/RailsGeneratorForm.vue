<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArchiveBoxIcon,
  CheckCircleIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import type {
  Project,
  RailsGeneratorField,
  RailsGeneratorFieldType,
  RailsGeneratorKind,
} from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useRailsGenerator } from '../composables/useRailsGenerator';

const props = defineProps<{
  project: Project;
  kind: RailsGeneratorKind;
  title: string;
  hint: string;
  databases: string[];
}>();

const FIELD_TYPES: RailsGeneratorFieldType[] = [
  'string',
  'text',
  'integer',
  'bigint',
  'float',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'time',
  'timestamp',
  'binary',
  'references',
  'uuid',
];

const name = ref('');
const fields = ref<RailsGeneratorField[]>([{ name: '', type: 'string' }]);
const database = ref('primary');

const {
  pendingConfirmation,
  preparing,
  running,
  errorMessage,
  result,
  prepare,
  cancel,
  confirm,
  reset,
} = useRailsGenerator(() => props.project);

useAutoDismiss(errorMessage, '');

const validFields = computed(() =>
  fields.value.filter((field) => field.name.trim().length > 0),
);
const canSubmit = computed(
  () =>
    name.value.trim().length > 0 &&
    !preparing.value &&
    !pendingConfirmation.value,
);

function addField(): void {
  fields.value = [...fields.value, { name: '', type: 'string' }];
}

function removeField(index: number): void {
  fields.value = fields.value.filter(
    (_field, candidateIndex) => candidateIndex !== index,
  );
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  await prepare(
    props.kind,
    name.value.trim(),
    validFields.value,
    props.databases.length > 1 ? database.value : undefined,
  );
}

async function confirmAndReset(): Promise<void> {
  await confirm();
  if (!errorMessage.value) {
    name.value = '';
    fields.value = [{ name: '', type: 'string' }];
  }
}

watch(
  () => props.project.id,
  () => {
    reset();
    name.value = '';
    fields.value = [{ name: '', type: 'string' }];
    database.value = 'primary';
  },
);
</script>

<template>
  <section class="database-generator-form">
    <header>
      <div>
        <SparklesIcon aria-hidden="true" />
        <h4>{{ title }}</h4>
      </div>
      <p>{{ hint }}</p>
    </header>

    <div v-if="!pendingConfirmation" class="database-generator-fields">
      <label class="database-generator-name">
        <span>Nome</span>
        <input
          v-model="name"
          type="text"
          :placeholder="kind === 'model' ? 'Product' : 'AddPriceToProducts'"
        />
      </label>

      <div v-if="databases.length > 1" class="database-generator-database">
        <span>Banco</span>
        <div class="database-segmented-control">
          <button
            v-for="item in databases"
            :key="item"
            type="button"
            :class="{ active: database === item }"
            @click="database = item"
          >
            {{ item === 'primary' ? 'Principal' : item }}
          </button>
        </div>
      </div>

      <div class="database-generator-field-list">
        <span class="database-generator-field-list-label">Campos</span>
        <div
          v-for="(field, index) in fields"
          :key="index"
          class="database-generator-field-row"
        >
          <input v-model="field.name" type="text" placeholder="nome_do_campo" />
          <select v-model="field.type">
            <option v-for="type in FIELD_TYPES" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
          <button
            type="button"
            aria-label="Remover campo"
            :disabled="fields.length === 1"
            @click="removeField(index)"
          >
            <TrashIcon aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          class="database-generator-add-field"
          @click="addField"
        >
          <PlusIcon aria-hidden="true" />Adicionar campo
        </button>
      </div>

      <button
        type="button"
        class="database-action-primary"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ preparing ? 'Preparando…' : 'Pré-visualizar e gerar' }}
      </button>
      <p v-if="errorMessage" class="database-explorer-alert" role="alert">
        {{ errorMessage }}
      </p>
    </div>

    <div v-else class="database-generator-confirm">
      <p class="database-generator-command">
        <code>{{ pendingConfirmation.command }}</code>
      </p>
      <div class="database-generator-confirm-actions">
        <button type="button" :disabled="running" @click="confirmAndReset">
          {{ running ? 'Gerando…' : 'Confirmar' }}
        </button>
        <button type="button" :disabled="running" @click="cancel">
          Cancelar
        </button>
      </div>
      <p v-if="errorMessage" class="database-explorer-alert" role="alert">
        {{ errorMessage }}
      </p>
    </div>

    <div
      v-if="result"
      class="database-generator-result"
      :class="{ 'is-failure': !result.succeeded }"
    >
      <p>
        <CheckCircleIcon aria-hidden="true" />{{
          result.succeeded
            ? 'Gerado com sucesso.'
            : 'Falhou. Veja a saída abaixo.'
        }}
      </p>
      <ul
        v-if="result.createdFiles.length > 0"
        class="database-generator-files"
      >
        <li v-for="file in result.createdFiles" :key="file">
          <ArchiveBoxIcon aria-hidden="true" /><code>{{ file }}</code>
        </li>
      </ul>
      <pre class="database-command-output">{{ result.output }}</pre>
    </div>
  </section>
</template>
