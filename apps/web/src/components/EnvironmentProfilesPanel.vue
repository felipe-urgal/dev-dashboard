<script setup lang="ts">
import {
  KeyIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  onMounted,
  reactive,
  ref,
} from 'vue';
import type {
  CreateEnvironmentProfileInput,
  EnvironmentProfile,
  EnvironmentProfileList,
} from '@dev-dashboard/contracts';
import {
  createEnvironmentProfile,
  deleteEnvironmentProfile,
  fetchEnvironmentProfiles,
  updateEnvironmentProfile,
} from '../api';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import LoadingSkeleton from './LoadingSkeleton.vue';

const SENSITIVE_VARIABLE_NAME_PATTERN = /SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|_KEY$|^KEY$|APIKEY/i;
const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface ProfileVariableRow {
  name: string;
  value: string;
}

const profileList = ref<EnvironmentProfileList>();
const profilesLoading = ref(true);
const profileSaving = ref(false);
const profilesError = ref('');
const profilesFeedback = ref('');
const profileForm = reactive<{
  id: string | undefined;
  name: string;
  variables: ProfileVariableRow[];
}>({
  id: undefined,
  name: '',
  variables: [{ name: '', value: '' }],
});

const configuredVariableCount = computed(() => (
  profileForm.variables.filter((variable) => variable.name.trim().length > 0).length
));

const canAddVariable = computed(() => (
  !profileList.value
  || profileForm.variables.length < profileList.value.limits.maxVariablesPerProfile
));

useAutoDismiss(profilesError, '');
useAutoDismiss(profilesFeedback, '');

function isSensitiveVariableName(name: string): boolean {
  return SENSITIVE_VARIABLE_NAME_PATTERN.test(name);
}

function resetProfileForm(): void {
  profileForm.id = undefined;
  profileForm.name = '';
  profileForm.variables = [{ name: '', value: '' }];
  profilesError.value = '';
  profilesFeedback.value = '';
}

function editProfile(profile: EnvironmentProfile): void {
  profileForm.id = profile.id;
  profileForm.name = profile.name;
  profileForm.variables = profile.variables.length > 0
    ? profile.variables.map((variable) => ({ name: variable.name, value: variable.value ?? '' }))
    : [{ name: '', value: '' }];
  profilesError.value = '';
  profilesFeedback.value = '';
}

async function loadProfiles(preferredProfileId?: string): Promise<void> {
  profilesLoading.value = true;
  profilesError.value = '';

  try {
    const response = await fetchEnvironmentProfiles();
    profileList.value = response;
    const selectedId = preferredProfileId ?? profileForm.id;
    const selectedProfile = response.profiles.find((profile) => profile.id === selectedId)
      ?? response.profiles[0];

    if (selectedProfile) editProfile(selectedProfile);
    else resetProfileForm();
  } catch (cause) {
    profilesError.value = cause instanceof Error
      ? cause.message
      : 'Não foi possível carregar os perfis de ambiente.';
  } finally {
    profilesLoading.value = false;
  }
}

function addVariableRow(): void {
  if (!canAddVariable.value) return;
  profileForm.variables.push({ name: '', value: '' });
}

function removeVariableRow(index: number): void {
  if (profileForm.variables.length <= 1) return;
  profileForm.variables.splice(index, 1);
}

function profileUpdatedLabel(updatedAt: string): string {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 'Atualizado recentemente';

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const updatedDayStart = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
  const differenceInDays = Math.round((dayStart - updatedDayStart) / 86_400_000);

  if (differenceInDays === 0) return 'Atualizado hoje';
  if (differenceInDays === 1) return 'Atualizado ontem';
  return `Atualizado em ${shortDateFormatter.format(updated)}`;
}

async function saveProfile(): Promise<void> {
  profileSaving.value = true;
  profilesError.value = '';
  profilesFeedback.value = '';
  const wasEditing = Boolean(profileForm.id);

  try {
    const input: CreateEnvironmentProfileInput = {
      name: profileForm.name.trim(),
      variables: profileForm.variables
        .filter((variable) => variable.name.trim().length > 0)
        .map((variable) => {
          const name = variable.name.trim();
          if (isSensitiveVariableName(name) || variable.value.trim().length === 0) return { name };
          return { name, value: variable.value };
        }),
    };
    const savedProfile = profileForm.id
      ? await updateEnvironmentProfile(profileForm.id, input)
      : await createEnvironmentProfile(input);

    await loadProfiles(savedProfile.id);
    profilesFeedback.value = wasEditing
      ? 'Perfil atualizado com sucesso.'
      : 'Perfil criado com sucesso.';
  } catch (cause) {
    profilesError.value = cause instanceof Error
      ? cause.message
      : 'Não foi possível salvar o perfil de ambiente.';
  } finally {
    profileSaving.value = false;
  }
}

async function removeSelectedProfile(): Promise<void> {
  if (!profileForm.id) return;

  profilesError.value = '';
  profilesFeedback.value = '';

  try {
    await deleteEnvironmentProfile(profileForm.id);
    resetProfileForm();
    await loadProfiles();
    profilesFeedback.value = 'Perfil removido com sucesso.';
  } catch (cause) {
    profilesError.value = cause instanceof Error
      ? cause.message
      : 'Não foi possível remover o perfil de ambiente.';
  }
}

onMounted(() => void loadProfiles());
</script>

<template>
  <section class="settings-panel" aria-labelledby="environment-profiles-title">
    <header class="settings-section-heading">
      <KeyIcon aria-hidden="true" />
      <div>
        <h3 id="environment-profiles-title">Perfis de ambiente</h3>
        <p>
          Selecione um perfil e edite nome e variáveis sem trocar de contexto. Valores de token, senha, chave ou
          credencial nunca são armazenados.
        </p>
      </div>
    </header>

    <LoadingSkeleton
      v-if="profilesLoading"
      label="Carregando perfis de ambiente…"
      :rows="3"
    />

    <template v-else-if="profileList">
      <div class="environment-profiles-layout">
        <aside class="environment-profiles-sidebar" aria-label="Lista de perfis de ambiente">
          <header class="environment-profiles-sidebar-header">
            <div>
              <strong>Perfis</strong>
              <span>
                {{ profileList.profiles.length }} cadastrado{{ profileList.profiles.length === 1 ? '' : 's' }}
              </span>
            </div>
            <button
              type="button"
              class="secondary-button environment-profile-icon-button"
              aria-label="Criar novo perfil"
              @click="resetProfileForm"
            >
              <PlusIcon aria-hidden="true" />
            </button>
          </header>

          <div v-if="profileList.profiles.length > 0" class="environment-profiles-list" role="list">
            <button
              v-for="profile in profileList.profiles"
              :key="profile.id"
              type="button"
              class="environment-profile-list-item"
              :class="{ 'is-selected': profileForm.id === profile.id }"
              :aria-pressed="profileForm.id === profile.id"
              role="listitem"
              @click="editProfile(profile)"
            >
              <span>
                <strong>{{ profile.name }}</strong>
                <small>{{ profileUpdatedLabel(profile.updatedAt) }}</small>
              </span>
              <span class="environment-profile-count" :aria-label="`${profile.variables.length} variáveis`">
                {{ profile.variables.length }}
              </span>
            </button>
          </div>
          <p v-else class="environment-profiles-empty">
            Nenhum perfil de ambiente cadastrado. Crie o primeiro ao lado.
          </p>

          <footer class="environment-profiles-sidebar-footer">
            <button type="button" class="secondary-button" @click="resetProfileForm">
              <PlusIcon aria-hidden="true" />
              Novo perfil
            </button>
          </footer>
        </aside>

        <form
          class="environment-profile-editor"
          aria-label="Criar ou editar perfil de ambiente"
          @submit.prevent="saveProfile"
        >
          <header class="environment-profile-editor-header">
            <div>
              <strong>{{ profileForm.id ? profileForm.name || 'Perfil sem nome' : 'Novo perfil' }}</strong>
              <span>
                {{ profileForm.id
                  ? `${configuredVariableCount} ${configuredVariableCount === 1 ? 'variável configurada' : 'variáveis configuradas'}`
                  : 'Defina um nome e adicione as variáveis necessárias' }}
              </span>
            </div>
            <div class="environment-profile-editor-actions">
              <button
                v-if="profileForm.id"
                type="button"
                class="secondary-button environment-profile-danger-button"
                :disabled="profileSaving"
                @click="removeSelectedProfile"
              >
                <TrashIcon aria-hidden="true" />
                Remover
              </button>
              <button
                type="submit"
                class="primary-button"
                :disabled="profileSaving || !profileForm.name.trim()"
              >
                {{ profileSaving ? 'Salvando…' : profileForm.id ? 'Salvar alterações' : 'Criar perfil' }}
              </button>
            </div>
          </header>

          <div class="environment-profile-editor-body">
            <div class="environment-profile-name-row">
              <label class="environment-profile-field" for="environment-profile-name-input">
                <span>Nome do perfil</span>
                <input
                  id="environment-profile-name-input"
                  v-model="profileForm.name"
                  type="text"
                  required
                  :maxlength="profileList.limits.maxNameLength"
                  placeholder="Ex.: Desenvolvimento"
                >
              </label>

              <aside class="environment-profile-security-note">
                <ShieldCheckIcon aria-hidden="true" />
                <span>
                  <strong>Valores sensíveis não são salvos.</strong>
                  Token, senha, chave e credencial guardam apenas o nome.
                </span>
              </aside>
            </div>

            <section class="environment-profile-variable-box" aria-labelledby="environment-profile-variables-title">
              <header class="environment-profile-variable-header">
                <div>
                  <strong id="environment-profile-variables-title">Variáveis</strong>
                  <span>Nome obrigatório, valor opcional</span>
                </div>
                <button
                  type="button"
                  class="secondary-button"
                  :disabled="!canAddVariable"
                  @click="addVariableRow"
                >
                  <PlusIcon aria-hidden="true" />
                  Adicionar variável
                </button>
              </header>

              <div class="environment-profile-variable-table">
                <div class="environment-profile-variable-table-header" aria-hidden="true">
                  <span>Variável</span>
                  <span>Valor</span>
                  <span />
                </div>

                <div
                  v-for="(variable, index) in profileForm.variables"
                  :key="index"
                  class="environment-profile-variable-row"
                >
                  <input
                    v-model="variable.name"
                    type="text"
                    placeholder="NOME_DA_VARIAVEL"
                    maxlength="128"
                    :aria-label="`Nome da variável ${index + 1}`"
                  >
                  <input
                    v-model="variable.value"
                    type="text"
                    :placeholder="isSensitiveVariableName(variable.name) ? 'Valor não será salvo' : 'Valor (opcional)'"
                    :disabled="isSensitiveVariableName(variable.name)"
                    :maxlength="profileList.limits.maxValueLength"
                    :aria-label="`Valor da variável ${index + 1}`"
                  >
                  <button
                    type="button"
                    class="secondary-button environment-profile-icon-button environment-profile-danger-button"
                    :disabled="profileForm.variables.length <= 1"
                    :aria-label="`Remover variável ${index + 1}`"
                    @click="removeVariableRow(index)"
                  >
                    <TrashIcon aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </form>
      </div>
    </template>

    <p v-if="profilesError" class="alert alert-error settings-feedback" role="alert">
      {{ profilesError }}
    </p>
    <p v-if="profilesFeedback" class="alert alert-success settings-feedback" role="status">
      {{ profilesFeedback }}
    </p>
  </section>
</template>

<style scoped>
.environment-profiles-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 430px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  overflow: hidden;
  background: var(--surface);
}

.environment-profiles-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--surface-muted, rgba(127, 127, 127, 0.06));
}

.environment-profiles-sidebar-header,
.environment-profile-editor-header,
.environment-profile-variable-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.environment-profiles-sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.environment-profiles-sidebar-header > div,
.environment-profile-editor-header > div:first-child,
.environment-profile-variable-header > div {
  display: grid;
  gap: 3px;
}

.environment-profiles-sidebar-header strong,
.environment-profile-variable-header strong {
  color: var(--text);
  font-size: 12px;
}

.environment-profiles-sidebar-header span,
.environment-profile-editor-header span,
.environment-profile-variable-header span {
  color: var(--text-muted);
  font-size: 10px;
}

.environment-profiles-list {
  display: grid;
  gap: 5px;
  padding: 8px;
}

.environment-profile-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.environment-profile-list-item:hover {
  border-color: var(--border);
  background: var(--surface);
}

.environment-profile-list-item.is-selected {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: var(--surface);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 8%, transparent);
}

.environment-profile-list-item strong,
.environment-profile-list-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.environment-profile-list-item strong {
  font-size: 12px;
}

.environment-profile-list-item small,
.environment-profile-count {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 10px;
}

.environment-profiles-empty {
  margin: 0;
  padding: 16px 12px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.environment-profiles-sidebar-footer {
  margin-top: auto;
  padding: 10px;
  border-top: 1px solid var(--border);
}

.environment-profiles-sidebar-footer .secondary-button {
  width: 100%;
}

.environment-profile-editor {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.environment-profile-editor-header {
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
}

.environment-profile-editor-header strong {
  color: var(--text);
  font-size: 13px;
}

.environment-profile-editor-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.environment-profile-editor-body {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.environment-profile-name-row {
  display: grid;
  grid-template-columns: minmax(220px, 420px) minmax(260px, 1fr);
  gap: 16px;
  align-items: end;
}

.environment-profile-field {
  display: grid;
  gap: 6px;
}

.environment-profile-field > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: var(--font-weight-strong);
}

.environment-profile-field input,
.environment-profile-variable-row input {
  width: 100%;
  min-height: 36px;
}

.environment-profile-security-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: var(--radius-sm, 8px);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.environment-profile-security-note svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--accent);
}

.environment-profile-security-note strong {
  display: block;
  color: var(--text);
}

.environment-profile-variable-box {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 9px);
  background: var(--surface-muted, rgba(127, 127, 127, 0.05));
}

.environment-profile-variable-header {
  margin-bottom: 10px;
}

.environment-profile-variable-table {
  display: grid;
  gap: 7px;
}

.environment-profile-variable-table-header,
.environment-profile-variable-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(240px, 1.35fr) 36px;
  gap: 8px;
  align-items: center;
}

.environment-profile-variable-table-header {
  padding: 0 2px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.environment-profile-icon-button {
  width: 36px;
  min-width: 36px;
  padding-inline: 0;
}

.environment-profile-icon-button svg,
.environment-profile-editor-actions svg,
.environment-profile-variable-header svg,
.environment-profiles-sidebar-footer svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.environment-profile-danger-button {
  color: var(--danger, #c43d4f);
}

.settings-feedback {
  margin-top: 12px;
}

@media (max-width: 980px) {
  .environment-profiles-layout {
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .environment-profile-name-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .environment-profiles-layout {
    grid-template-columns: 1fr;
  }

  .environment-profiles-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .environment-profiles-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .environment-profiles-sidebar-footer {
    margin-top: 0;
  }

  .environment-profile-editor-header {
    align-items: stretch;
    flex-direction: column;
  }

  .environment-profile-editor-actions {
    justify-content: flex-end;
  }
}

@media (max-width: 520px) {
  .environment-profiles-list {
    grid-template-columns: 1fr;
  }

  .environment-profile-editor-actions,
  .environment-profile-variable-header {
    align-items: stretch;
    flex-direction: column;
  }

  .environment-profile-editor-actions > *,
  .environment-profile-variable-header .secondary-button {
    width: 100%;
  }

  .environment-profile-variable-table-header {
    display: none;
  }

  .environment-profile-variable-row {
    grid-template-columns: minmax(0, 1fr) 36px;
  }

  .environment-profile-variable-row input:nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
