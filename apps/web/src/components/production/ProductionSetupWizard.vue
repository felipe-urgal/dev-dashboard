<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/vue/24/outline';

import type {
  ProductionCommands,
  ProductionContractDraft,
  ProductionContractPreview,
  ProductionContractSetupInfo,
  ProductionPolicies,
} from '@dev-dashboard/contracts';

import {
  fetchProductionContractSetup,
  previewProductionContract,
  saveProductionContract,
} from '../../api';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

type Operation = keyof ProductionCommands;
type Strategy = ProductionContractDraft['strategy'];

const props = defineProps<{
  projectId: string;
  defaultBranch: string;
}>();

const emit = defineEmits<{ saved: [] }>();

interface StrategyOption {
  id: Strategy;
  title: string;
  description: string;
  required: Operation[];
  optional: Operation[];
}

const STRATEGIES: StrategyOption[] = [
  {
    id: 'command',
    title: 'Deploy por comando',
    description:
      'O Dev Dashboard roda os seus scripts prod:* (por exemplo, no systemd ou Docker Compose).',
    required: ['status', 'check', 'deploy', 'verify'],
    optional: [
      'backup',
      'migrate',
      'restoreCheck',
      'rollback',
      'logs',
      'prepare',
    ],
  },
  {
    id: 'git-managed',
    title: 'Git → Vercel',
    description:
      'A Vercel publica a partir do Git; o Dev Dashboard roda check/verify e acompanha o deployment.',
    required: ['check', 'verify'],
    optional: ['status', 'backup', 'migrate', 'logs', 'prepare'],
  },
  {
    id: 'self-update',
    title: 'Auto-atualização',
    description:
      'Para o próprio Dev Dashboard: atualiza o clone e reinicia a API, com confirmação.',
    required: ['status', 'check'],
    optional: [],
  },
];

const BACKUP_LABELS: Record<ProductionPolicies['backup'], string> = {
  'required-before-deploy': 'Obrigatório antes do deploy',
  'required-before-migration': 'Obrigatório antes de migrations',
  external: 'Feito fora do Dev Dashboard',
  'not-configured': 'Não configurado',
};
const MIGRATION_LABELS: Record<ProductionPolicies['migrations'], string> = {
  startup: 'Na inicialização da aplicação',
  'before-deploy': 'Antes do deploy',
  'not-configured': 'Não configurado',
};
const ROLLBACK_LABELS: Record<ProductionPolicies['rollback'], string> = {
  'restore-backup-when-schema-changed': 'Restaurar backup se o schema mudou',
  'manual-restore': 'Restauração manual',
  'provider-only-when-schema-compatible':
    'Pelo provedor, se o schema for compatível',
  'not-configured': 'Não configurado',
};

const setup = ref<ProductionContractSetupInfo | null>(null);
const setupError = ref('');
const strategy = ref<Strategy>('command');
const provider = ref<'systemd' | 'docker-compose'>('systemd');
const branch = ref(props.defaultBranch || 'main');
const healthUrl = ref('');
const externalProject = ref('');
const policies = ref<ProductionPolicies>({
  backup: 'not-configured',
  migrations: 'not-configured',
  rollback: 'not-configured',
});
const optionalChosen = ref<Set<Operation>>(new Set());
const preview = ref<ProductionContractPreview | null>(null);
const previewing = ref(false);
const saving = ref(false);
const saveError = ref('');
const needsOverwrite = ref(false);

const option = computed(() =>
  STRATEGIES.find((item) => item.id === strategy.value)!,
);
const available = computed(() => new Set(setup.value?.scripts ?? []));

function scriptName(operation: Operation): string {
  return operation === 'restoreCheck'
    ? 'prod:restore-check'
    : `prod:${operation}`;
}

function hasScript(operation: Operation): boolean {
  return available.value.has(scriptName(operation));
}

const draft = computed<ProductionContractDraft>(() => ({
  strategy: strategy.value,
  provider:
    strategy.value === 'self-update'
      ? 'none'
      : strategy.value === 'git-managed'
        ? 'vercel'
        : provider.value,
  branch: branch.value,
  commands: [...option.value.required, ...optionalChosen.value],
  ...(healthUrl.value.trim() ? { healthUrl: healthUrl.value.trim() } : {}),
  ...(strategy.value === 'git-managed' && externalProject.value.trim()
    ? { externalProject: externalProject.value.trim() }
    : {}),
  policies: policies.value,
}));

const manifestJson = computed(() =>
  preview.value ? JSON.stringify(preview.value.manifest, null, 2) : '',
);

function resetOptionalForStrategy(): void {
  optionalChosen.value = new Set(
    option.value.optional.filter((operation) => hasScript(operation)),
  );
}

function toggleOptional(operation: Operation): void {
  const next = new Set(optionalChosen.value);
  if (next.has(operation)) next.delete(operation);
  else next.add(operation);
  optionalChosen.value = next;
}

let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewGeneration = 0;

async function runPreview(): Promise<void> {
  const generation = ++previewGeneration;
  previewing.value = true;
  try {
    const result = await previewProductionContract(
      props.projectId,
      draft.value,
    );
    if (generation === previewGeneration) preview.value = result;
  } catch (error) {
    if (generation !== previewGeneration) return;
    preview.value = null;
    saveError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível validar o contrato.';
  } finally {
    if (generation === previewGeneration) previewing.value = false;
  }
}

function schedulePreview(): void {
  clearTimeout(previewTimer);
  saveError.value = '';
  needsOverwrite.value = false;
  previewTimer = setTimeout(() => void runPreview(), 350);
}

async function save(overwrite = false): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    await saveProductionContract(props.projectId, draft.value, overwrite);
    emit('saved');
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Não foi possível gravar o contrato.';
    if (/já tem um contrato/i.test(message)) {
      needsOverwrite.value = true;
    } else {
      saveError.value = message;
    }
  } finally {
    saving.value = false;
  }
}

watch(strategy, () => {
  resetOptionalForStrategy();
  schedulePreview();
});
watch(
  [provider, branch, healthUrl, externalProject, policies, optionalChosen],
  schedulePreview,
  {
    deep: true,
  },
);

onMounted(async () => {
  try {
    setup.value = await fetchProductionContractSetup(props.projectId);
  } catch (error) {
    setupError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível ler os scripts do projeto.';
  }
  resetOptionalForStrategy();
  void runPreview();
});

onBeforeUnmount(() => {
  clearTimeout(previewTimer);
  previewGeneration += 1;
});
</script>

<template>
  <section class="prod-wizard" aria-label="Configurar produção">
    <header>
      <span class="prod-wizard-eyebrow">Configurar produção</span>
      <h4>Crie o contrato de produção deste projeto</h4>
      <p>
        O contrato é o arquivo <code>.dev-dashboard/production.json</code>. Ele
        referencia scripts <code>prod:*</code> do seu <code>package.json</code>;
        o assistente não cria nem altera esses scripts.
      </p>
      <p v-if="setup?.manifestExists" class="prod-wizard-warning">
        Já existe um production.json (inválido). Salvar vai substituí-lo.
      </p>
      <p v-if="setupError" class="prod-wizard-warning">{{ setupError }}</p>
    </header>

    <div
      class="prod-wizard-strategies"
      role="radiogroup"
      aria-label="Estratégia"
    >
      <label
        v-for="item in STRATEGIES"
        :key="item.id"
        class="prod-wizard-strategy"
        :data-active="strategy === item.id || undefined"
      >
        <input v-model="strategy" type="radio" :value="item.id" />
        <strong>{{ item.title }}</strong>
        <span>{{ item.description }}</span>
        <div class="prod-wizard-scripts">
          <UiTag
            v-for="operation in item.required"
            :key="operation"
            :tone="hasScript(operation) ? 'success' : 'danger'"
            mono
          >
            {{ scriptName(operation) }}
          </UiTag>
        </div>
      </label>
    </div>

    <div class="prod-wizard-fields">
      <label>
        <span>Branch de produção</span>
        <input v-model="branch" type="text" autocomplete="off" />
      </label>

      <label v-if="strategy === 'command'">
        <span>Onde roda</span>
        <select v-model="provider">
          <option value="systemd">systemd</option>
          <option value="docker-compose">Docker Compose</option>
        </select>
      </label>

      <label v-if="strategy === 'git-managed'">
        <span>Projeto na Vercel</span>
        <input
          v-model="externalProject"
          type="text"
          autocomplete="off"
          placeholder="nome-do-projeto"
        />
      </label>

      <label v-if="strategy !== 'self-update'" class="prod-wizard-wide">
        <span>URL de health check <small>opcional</small></span>
        <input
          v-model="healthUrl"
          type="text"
          autocomplete="off"
          placeholder="https://meu-app.exemplo/health"
        />
      </label>
    </div>

    <fieldset v-if="option.optional.length > 0" class="prod-wizard-ops">
      <legend>Operações opcionais</legend>
      <label v-for="operation in option.optional" :key="operation">
        <input
          type="checkbox"
          :checked="optionalChosen.has(operation)"
          :disabled="!hasScript(operation)"
          @change="toggleOptional(operation)"
        />
        <code>{{ scriptName(operation) }}</code>
        <small v-if="!hasScript(operation)">script não encontrado</small>
      </label>
    </fieldset>

    <div v-if="strategy !== 'self-update'" class="prod-wizard-fields">
      <label>
        <span>Backup</span>
        <select v-model="policies.backup">
          <option
            v-for="(label, value) in BACKUP_LABELS"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        <span>Migrations</span>
        <select v-model="policies.migrations">
          <option
            v-for="(label, value) in MIGRATION_LABELS"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        <span>Rollback</span>
        <select v-model="policies.rollback">
          <option
            v-for="(label, value) in ROLLBACK_LABELS"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
      </label>
    </div>

    <div
      class="prod-wizard-validation"
      :data-valid="preview?.valid || undefined"
      role="status"
    >
      <template v-if="previewing && !preview">Validando…</template>
      <template v-else-if="preview?.valid">
        <CheckCircleIcon aria-hidden="true" />
        <span>Contrato válido. Pronto para criar.</span>
      </template>
      <template v-else-if="preview">
        <XCircleIcon aria-hidden="true" />
        <div>
          <strong>{{
            preview.message ?? 'O contrato ainda não é válido.'
          }}</strong>
          <small v-if="preview.missingScripts.length > 0">
            Adicione ao package.json:
            <code v-for="script in preview.missingScripts" :key="script">{{
              script
            }}</code>
          </small>
        </div>
      </template>
    </div>

    <details v-if="manifestJson" class="prod-wizard-json">
      <summary>Ver o JSON que será gravado</summary>
      <pre>{{ manifestJson }}</pre>
    </details>

    <p v-if="saveError" class="prod-wizard-warning" role="alert">
      {{ saveError }}
    </p>

    <footer>
      <template v-if="needsOverwrite">
        <span class="prod-wizard-warning">
          Já existe um contrato. Substituir o arquivo atual?
        </span>
        <UiButton :disabled="saving" @click="needsOverwrite = false"
          >Cancelar</UiButton
        >
        <UiButton
          variant="danger"
          :busy="saving"
          :disabled="saving"
          @click="save(true)"
        >
          Substituir contrato
        </UiButton>
      </template>
      <UiButton
        v-else
        variant="primary"
        :busy="saving"
        :disabled="saving || !preview?.valid"
        @click="save(setup?.manifestExists === true)"
      >
        {{ saving ? 'Gravando…' : 'Criar contrato' }}
      </UiButton>
    </footer>
  </section>
</template>

<style scoped>
.prod-wizard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-wizard header h4 {
  margin: 2px 0 6px;
  font-size: 16px;
}

.prod-wizard header p {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.prod-wizard-eyebrow {
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prod-wizard code {
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}

.prod-wizard-warning {
  color: var(--warning-text) !important;
}

.prod-wizard-strategies {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.prod-wizard-strategy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  cursor: pointer;
}

.prod-wizard-strategy[data-active] {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.prod-wizard-strategy input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.prod-wizard-strategy span {
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.45;
}

.prod-wizard-scripts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.prod-wizard-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.prod-wizard-fields label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.prod-wizard-fields label > span {
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

.prod-wizard-fields small {
  color: var(--text-dim);
  font-weight: 500;
}

.prod-wizard-wide {
  grid-column: 1 / -1;
}

.prod-wizard-fields input,
.prod-wizard-fields select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 13.5px;
}

.prod-wizard-fields input:focus,
.prod-wizard-fields select:focus {
  border-color: var(--accent);
  outline: none;
}

.prod-wizard-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 0;
  padding: 0;
  border: 0;
}

.prod-wizard-ops legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

.prod-wizard-ops label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.prod-wizard-ops small {
  color: var(--text-dim);
}

.prod-wizard-validation {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  color: var(--danger-text, #f85149);
  background: color-mix(in srgb, var(--danger-text, #f85149) 10%, transparent);
  font-size: 13px;
}

.prod-wizard-validation[data-valid] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 10%, transparent);
}

.prod-wizard-validation svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.prod-wizard-validation div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.prod-wizard-validation small {
  color: var(--text-muted);
}

.prod-wizard-validation small code {
  margin-left: 6px;
}

.prod-wizard-json summary {
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.prod-wizard-json pre {
  margin: 8px 0 0;
  padding: 12px;
  overflow: auto;
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}

.prod-wizard footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
