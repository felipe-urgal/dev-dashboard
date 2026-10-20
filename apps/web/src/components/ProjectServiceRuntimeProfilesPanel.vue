<script setup lang="ts">
import type {
  ProjectServiceBindingView,
  ServiceLifecycleAction,
  ServiceLifecyclePlan,
  ServiceLifecyclePlanNode,
  ServiceRuntimeProfileKind,
  ServiceRuntimeProfileView,
} from '@dev-dashboard/contracts';
import { computed, ref, watch } from 'vue';

import { fetchProjectServiceBindings } from '../api/service-diagnostics';
import {
  fetchRuntimeProfilePlan,
  fetchRuntimeProfiles,
  removeRuntimeProfile,
  saveRuntimeProfile,
  type RuntimeProfilesResponse,
} from '../api/service-runtime-profiles';

const props = defineProps<{
  projectId: string;
  environmentInstanceId?: string;
}>();

const environmentId = computed(
  () => props.environmentInstanceId ?? 'environment:primary:' + props.projectId,
);
const loading = ref(false);
const saving = ref(false);
const loadingPreview = ref(false);
const error = ref('');
const previewError = ref('');
const profiles = ref<RuntimeProfilesResponse | null>(null);
const bindings = ref<ProjectServiceBindingView[]>([]);
const bindingRevision = ref('');
const partial = ref(false);
const selectedId = ref('');
const action = ref<ServiceLifecycleAction>('start');
const preview = ref<ServiceLifecyclePlan | null>(null);
const baseline = ref<ServiceLifecyclePlan | null>(null);
const editor = ref<'none' | 'new' | 'edit'>('none');
const draftKind = ref<ServiceRuntimeProfileKind>('dev');
const draftBindingIds = ref<string[]>([]);
const deleting = ref(false);
let generation = 0;
let previewGeneration = 0;

const current = computed<ServiceRuntimeProfileView | undefined>(() =>
  profiles.value?.profiles.find((profile) => profile.id === selectedId.value),
);
const available = computed(() =>
  bindings.value.filter(
    (binding) =>
      binding.enabled && binding.environmentInstanceId === environmentId.value,
  ),
);
const eligible = computed(
  () =>
    profiles.value !== null &&
    profiles.value.bindingsRevision === bindingRevision.value,
);
const availableKinds = computed<ServiceRuntimeProfileKind[]>(() =>
  (['dev', 'test', 'production'] as const).filter(
    (kind) =>
      !profiles.value?.profiles.some((profile) => profile.kind === kind),
  ),
);
const included = computed(() => {
  if (!current.value) return available.value;
  const ids = new Set(current.value.bindingIds);
  return available.value.filter((binding) => ids.has(binding.id));
});
const omitted = computed(() => {
  if (!current.value) return [];
  const ids = new Set(current.value.bindingIds);
  return available.value.filter((binding) => !ids.has(binding.id));
});
const missing = computed(
  () =>
    preview.value?.nodes.filter((node) => node.relation === 'missing') ?? [],
);
const shared = computed(
  () =>
    preview.value?.nodes.filter(
      (node) =>
        node.consumerCount > 1 ||
        (current.value !== undefined &&
          profiles.value?.profiles.some(
            (profile) =>
              profile.id !== current.value?.id &&
              included.value.some(
                (binding) =>
                  binding.serviceRef === node.serviceRef &&
                  profile.bindingIds.includes(binding.id),
              ),
          )),
    ) ?? [],
);
const alreadyReady = computed(
  () =>
    preview.value?.nodes.filter(
      (node) => node.disposition === 'alreadyReady',
    ) ?? [],
);
const unsupported = computed(
  () =>
    preview.value?.nodes.filter((node) => node.disposition === 'unsupported') ??
    [],
);
const wouldChange = computed(
  () =>
    preview.value?.nodes.filter(
      (node) =>
        node.disposition === 'willStart' || node.disposition === 'willStop',
    ) ?? [],
);

function portsFor(node: ServiceLifecyclePlanNode | undefined): string {
  if (!node || !node.ports.length) return 'sem portas observadas';
  return node.ports.join(', ');
}

// Compare matching declared roles; identical names alone cannot imply that
// different resources, databases or ports are interchangeable.
const rolePortDifferences = computed(() => {
  if (!current.value || !preview.value || !baseline.value) return [];
  const changes: Array<{ role: string; before: string; after: string }> = [];
  for (const chosen of included.value) {
    if (!chosen.role) continue;
    for (const other of omitted.value) {
      if (other.role !== chosen.role || other.serviceRef === chosen.serviceRef)
        continue;
      const target = preview.value.nodes.find(
        (node) => node.serviceRef === chosen.serviceRef,
      );
      const previous = baseline.value.nodes.find(
        (node) => node.serviceRef === other.serviceRef,
      );
      if (!target || !previous) continue;
      const from = portsFor(previous);
      const to = portsFor(target);
      if (from !== to)
        changes.push({ role: chosen.role, before: from, after: to });
    }
  }
  return changes;
});

function contextChanged(): void {
  generation++;
  previewGeneration++;
  saving.value = false;
  loadingPreview.value = false;
  profiles.value = null;
  bindings.value = [];
  bindingRevision.value = '';
  selectedId.value = '';
  preview.value = null;
  baseline.value = null;
  editor.value = 'none';
  deleting.value = false;
  error.value = '';
  previewError.value = '';
  void reload('');
}

watch(() => [props.projectId, props.environmentInstanceId], contextChanged, {
  immediate: true,
});

async function reload(prefer: string): Promise<void> {
  const request = ++generation;
  previewGeneration++;
  const projectId = props.projectId;
  const environmentInstanceId = environmentId.value;
  loading.value = true;
  preview.value = null;
  baseline.value = null;
  error.value = '';
  previewError.value = '';
  try {
    const [list, bindingList] = await Promise.all([
      fetchRuntimeProfiles(projectId, environmentInstanceId),
      fetchProjectServiceBindings(projectId),
    ]);
    if (request !== generation) return;
    profiles.value = list;
    bindings.value = bindingList.bindings;
    bindingRevision.value = bindingList.revision;
    partial.value = bindingList.partial;
    selectedId.value = list.profiles.some((profile) => profile.id === prefer)
      ? prefer
      : '';
    editor.value = 'none';
    deleting.value = false;
    if (list.bindingsRevision !== bindingList.revision) {
      error.value =
        'Os vínculos mudaram durante a leitura. Atualize antes de editar.';
    }
    void loadPreview();
  } catch {
    if (request === generation) {
      profiles.value = null;
      bindings.value = [];
      error.value =
        'Não foi possível carregar os perfis e vínculos deste ambiente.';
    }
  } finally {
    if (request === generation) loading.value = false;
  }
}

async function loadPreview(): Promise<void> {
  const request = ++previewGeneration;
  const context = generation;
  const projectId = props.projectId;
  const env = environmentId.value;
  const profileId = selectedId.value || undefined;
  const selectedAction = action.value;
  preview.value = null;
  baseline.value = null;
  previewError.value = '';
  if (!profiles.value || !eligible.value) return;
  loadingPreview.value = true;
  try {
    const [selected, unscoped] = await Promise.all([
      fetchRuntimeProfilePlan(projectId, env, selectedAction, profileId),
      profileId
        ? fetchRuntimeProfilePlan(projectId, env, selectedAction)
        : Promise.resolve(null),
    ]);
    if (request !== previewGeneration || context !== generation) return;
    preview.value = selected;
    baseline.value = unscoped;
  } catch {
    if (request === previewGeneration && context === generation)
      previewError.value =
        'Prévia indisponível ou desatualizada. Nenhuma ação foi executada. Atualize os perfis.';
  } finally {
    if (request === previewGeneration && context === generation)
      loadingPreview.value = false;
  }
}

function selectProfile(): void {
  editor.value = 'none';
  deleting.value = false;
  void loadPreview();
}

function chooseAction(): void {
  void loadPreview();
}

function beginNew(): void {
  const kind = availableKinds.value[0];
  if (!kind) return;
  editor.value = 'new';
  draftKind.value = kind;
  draftBindingIds.value = [];
  deleting.value = false;
  error.value = '';
}

function beginEdit(): void {
  if (!current.value) return;
  editor.value = 'edit';
  draftKind.value = current.value.kind;
  const valid = new Set(available.value.map((binding) => binding.id));
  draftBindingIds.value = current.value.bindingIds.filter((id) =>
    valid.has(id),
  );
  deleting.value = false;
  error.value = '';
}

async function save(): Promise<void> {
  if (
    !profiles.value ||
    !eligible.value ||
    saving.value ||
    editor.value === 'none'
  )
    return;
  const request = generation;
  const projectId = props.projectId;
  const env = environmentId.value;
  const id = editor.value === 'edit' ? current.value?.id : undefined;
  if (editor.value === 'edit' && !id) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await saveRuntimeProfile(
      projectId,
      env,
      {
        kind: draftKind.value,
        bindingIds: [...draftBindingIds.value],
        expectedRevision: profiles.value.revision,
        expectedBindingsRevision: profiles.value.bindingsRevision,
      },
      id,
    );
    if (request === generation) {
      saving.value = false;
      await reload(result.profile.id);
    }
  } catch {
    if (request === generation)
      error.value =
        'Não foi possível salvar: revisão ou vínculos alterados. Atualize e revise a seleção.';
  } finally {
    if (request === generation) saving.value = false;
  }
}

async function remove(): Promise<void> {
  if (
    !current.value ||
    !profiles.value ||
    !eligible.value ||
    saving.value ||
    !deleting.value
  )
    return;
  const request = generation;
  const id = current.value.id;
  saving.value = true;
  error.value = '';
  try {
    await removeRuntimeProfile(
      props.projectId,
      environmentId.value,
      id,
      profiles.value.revision,
    );
    if (request === generation) {
      saving.value = false;
      await reload('');
    }
  } catch {
    if (request === generation)
      error.value =
        'Não foi possível excluir o perfil. Atualize os dados e tente novamente.';
  } finally {
    if (request === generation) saving.value = false;
  }
}

const kindLabel: Record<ServiceRuntimeProfileKind, string> = {
  dev: 'Desenvolvimento',
  test: 'Teste',
  production: 'Produção',
};
const dispositionLabel: Record<
  ServiceLifecyclePlanNode['disposition'],
  string
> = {
  willStart: 'Iniciaria (apenas prévia)',
  willStop: 'Pararia (apenas prévia)',
  alreadyReady: 'Já ativo e pronto',
  retained: 'Preservado',
  blocked: 'Bloqueado',
  unsupported: 'Sem suporte',
};
</script>

<template>
  <section class="runtime-profiles" aria-labelledby="runtime-profiles-title">
    <header class="runtime-profiles-header">
      <div>
        <h3 id="runtime-profiles-title">Perfis de serviços do ambiente</h3>
        <p>
          Selecione um plano de Desenvolvimento, Teste ou Produção. A seleção e
          a prévia nunca iniciam, param ou alteram serviços.
        </p>
      </div>
      <button
        type="button"
        :disabled="loading || saving"
        @click="reload(selectedId)"
      >
        Atualizar perfis
      </button>
    </header>
    <p v-if="loading" role="status">Carregando perfis…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="profiles && !loading">
      <p v-if="partial" role="status">
        Inventário parcial: a ausência de observação não comprova serviço
        parado.
      </p>
      <div class="runtime-profiles-controls">
        <label for="runtime-profile-select">Perfil</label>
        <select
          id="runtime-profile-select"
          v-model="selectedId"
          :disabled="saving"
          @change="selectProfile"
        >
          <option value="">Padrão (todos os vínculos habilitados)</option>
          <option
            v-for="profile in profiles.profiles"
            :key="profile.id"
            :value="profile.id"
          >
            {{ kindLabel[profile.kind] }}
          </option>
        </select>
        <button
          v-if="availableKinds.length"
          type="button"
          :disabled="saving || !eligible"
          @click="beginNew"
        >
          Novo perfil
        </button>
        <button
          v-if="current"
          type="button"
          :disabled="saving || !eligible"
          @click="beginEdit"
        >
          Editar seleção
        </button>
        <button
          v-if="current && !deleting"
          type="button"
          :disabled="saving || !eligible"
          @click="
            deleting = true;
            editor = 'none';
          "
        >
          Excluir perfil…
        </button>
      </div>
      <p v-if="!current">
        Plano padrão: os vínculos habilitados deste ambiente continuam sendo
        usados sem alterar Stacks ou Compose.
      </p>
      <p v-if="current?.kind === 'production'" role="status">
        Produção: perfil somente declarativo. Deploy, migrações, credenciais e
        bancos reais continuam sob o Production Contract e suas políticas.
      </p>
      <p v-if="current?.staleBindingIds.length" role="alert">
        Perfil com {{ current.staleBindingIds.length }} vínculo(s) ausente(s),
        desabilitado(s) ou movido(s). Edite o perfil antes de gerar um plano.
      </p>
      <div
        v-if="deleting && current"
        class="runtime-profiles-confirm"
        role="group"
        aria-label="Confirmar exclusão"
      >
        <p>
          Excluir apenas a configuração {{ kindLabel[current.kind] }}? Nenhum
          serviço será parado.
        </p>
        <button type="button" :disabled="saving" @click="remove">
          Confirmar exclusão
        </button>
        <button type="button" :disabled="saving" @click="deleting = false">
          Cancelar
        </button>
      </div>
      <form
        v-if="editor !== 'none'"
        class="runtime-profiles-editor"
        @submit.prevent="save"
      >
        <h4>{{ editor === 'new' ? 'Novo perfil' : 'Editar perfil' }}</h4>
        <label for="runtime-profile-kind">Contexto</label>
        <select
          id="runtime-profile-kind"
          v-model="draftKind"
          :disabled="saving || editor === 'edit'"
        >
          <option
            v-for="kind in editor === 'new' ? availableKinds : [draftKind]"
            :key="kind"
            :value="kind"
          >
            {{ kindLabel[kind] }}
          </option>
        </select>
        <fieldset :disabled="saving">
          <legend>Serviços vinculados a este ambiente</legend>
          <label
            v-for="binding in available"
            :key="binding.id"
            class="runtime-profiles-check"
          >
            <input
              v-model="draftBindingIds"
              type="checkbox"
              :value="binding.id"
            />
            {{ binding.role ?? binding.serviceRef }} · {{ binding.relation }}
            <small v-if="binding.shared">(compartilhado)</small>
          </label>
          <p v-if="available.length === 0">
            Nenhum binding habilitado disponível.
          </p>
        </fieldset>
        <p>Escolher um binding não concede permissão de Start/Stop.</p>
        <button type="submit" :disabled="saving || !eligible">
          Salvar perfil
        </button>
        <button type="button" :disabled="saving" @click="editor = 'none'">
          Cancelar
        </button>
      </form>

      <div class="runtime-profiles-preview-controls">
        <label for="runtime-plan-action">Simulação</label>
        <select
          id="runtime-plan-action"
          v-model="action"
          @change="chooseAction"
        >
          <option value="start">Prévia Start (não executa)</option>
          <option value="stop">Prévia Stop (não executa)</option>
        </select>
      </div>
      <p v-if="loadingPreview" role="status">
        Calculando plano somente leitura…
      </p>
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <template v-if="preview && !loadingPreview">
        <p class="runtime-profiles-status" role="status">
          Plano
          {{
            preview.status === 'ready'
              ? 'sem bloqueios observados'
              : 'bloqueado'
          }}
          · {{ preview.nodes.length }} nó(s) · não executável
        </p>
        <p>
          {{ included.length }} serviços incluídos,
          {{ omitted.length }} omitidos,
          {{
            missing.length + (current?.staleBindingIds.length ?? 0)
          }}
          referências ausentes, {{ shared.length }} compartilhados,
          {{ alreadyReady.length }} já prontos, {{ unsupported.length }} sem
          suporte e {{ wouldChange.length }} ações potenciais (não executadas).
        </p>
        <p v-if="current">
          Selecionar este perfil não interrompe serviços omitidos.
          {{
            omitted.length ? 'Excluídos do plano:' : 'Nenhum vínculo omitido.'
          }}
          <span
            v-for="binding in omitted"
            :key="binding.id"
            class="runtime-profiles-omitted"
          >
            {{ binding.role ?? binding.serviceRef }}
            ({{
              portsFor(
                baseline?.nodes.find(
                  (node) => node.serviceRef === binding.serviceRef,
                ),
              )
            }})
          </span>
        </p>
        <p v-if="rolePortDifferences.length" role="status">
          Diferenças de portas observadas para papéis equivalentes:
          <span
            v-for="item in rolePortDifferences"
            :key="item.role + item.before + item.after"
          >
            {{ item.role }}: {{ item.before }} → {{ item.after }}.
          </span>
        </p>
        <p v-else-if="current">
          Sem mudanças de porta comparáveis por papel nos recursos observados.
          Portas de serviços incluídos e omitidos aparecem abaixo.
        </p>
        <ul
          v-if="preview.diagnostics.length"
          class="runtime-profiles-diagnostics"
        >
          <li v-for="diagnostic in preview.diagnostics" :key="diagnostic">
            {{ diagnostic }}
          </li>
        </ul>
        <div class="runtime-profiles-table-wrap">
          <table class="runtime-profiles-table">
            <caption>
              Recursos do plano
              {{
                action === 'start' ? 'Start' : 'Stop'
              }}
              (somente leitura)
            </caption>
            <thead>
              <tr>
                <th scope="col">Serviço</th>
                <th scope="col">Vínculo</th>
                <th scope="col">Estado</th>
                <th scope="col">Portas observadas</th>
                <th scope="col">Risco / decisão</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="node in preview.nodes" :key="node.serviceRef">
                <th scope="row">{{ node.name }}</th>
                <td>
                  {{ node.relation }} · {{ node.consumerCount }} consumidor(es)
                </td>
                <td>{{ node.state }} / {{ node.readiness }}</td>
                <td>{{ portsFor(node) }}</td>
                <td>
                  <strong>{{ dispositionLabel[node.disposition] }}</strong>
                  <small v-if="node.diagnostic">{{ node.diagnostic }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="preview.nodes.length === 0">
          Nenhum serviço no plano selecionado. Não há fallback implícito para
          outro perfil.
        </p>
        <p class="runtime-profiles-disclaimer">
          Observado em
          {{ new Date(preview.observedAt).toLocaleString('pt-BR') }}. A prévia
          expira em {{ new Date(preview.expiresAt).toLocaleString('pt-BR') }}.
          Evidências e portas podem mudar; o hash não autoriza execução.
        </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.runtime-profiles {
  margin-block-start: 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--border-color, #64748b);
  border-radius: 0.75rem;
}
.runtime-profiles-header,
.runtime-profiles-controls,
.runtime-profiles-preview-controls,
.runtime-profiles-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.runtime-profiles-header {
  justify-content: space-between;
}
.runtime-profiles-header h3 {
  margin: 0;
}
.runtime-profiles-header p {
  margin: 0.35rem 0;
}
.runtime-profiles-controls,
.runtime-profiles-preview-controls {
  margin-block: 1rem;
}
.runtime-profiles select {
  max-width: 100%;
  padding: 0.4rem;
}
.runtime-profiles-editor {
  display: grid;
  gap: 0.65rem;
  margin-block: 1rem;
}
.runtime-profiles-editor fieldset {
  display: grid;
  gap: 0.5rem;
  border: 1px solid var(--border-color, #64748b);
}
.runtime-profiles-check {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  overflow-wrap: anywhere;
}
.runtime-profiles-status {
  font-weight: 600;
}
.runtime-profiles-table-wrap {
  overflow-x: auto;
}
.runtime-profiles-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.runtime-profiles-table th,
.runtime-profiles-table td {
  border-bottom: 1px solid var(--border-color, #64748b);
  padding: 0.6rem;
  vertical-align: top;
}
.runtime-profiles-table small {
  display: block;
}
.runtime-profiles-omitted {
  display: inline-block;
  margin: 0.2rem 0.4rem;
  overflow-wrap: anywhere;
}
.runtime-profiles-disclaimer {
  font-size: 0.85rem;
  opacity: 0.85;
}
</style>
