<script setup lang="ts">
import {
  ArrowPathIcon,
  BeakerIcon,
  BellAlertIcon,
  ClockIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  PlusIcon,
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
  RetentionSettings,
  RetentionSettingsSnapshot,
} from '@dev-dashboard/contracts';
import {
  createEnvironmentProfile,
  deleteEnvironmentProfile,
  fetchEnvironmentProfiles,
  fetchRetentionSettings,
  updateEnvironmentProfile,
  updateRetentionSettings,
} from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { nativeNotificationStore } from '../stores/native-notifications';

const snapshot = ref<RetentionSettingsSnapshot>();
const form = reactive<RetentionSettings>({ retentionDays: 7, scriptHistoryLimit: 200, testHistoryLimit: 50 });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const feedback = ref('');
const notificationFeedback = ref('');
const nativeNotificationsEnabled = nativeNotificationStore.enabled;
const nativeNotificationStatus = nativeNotificationStore.status;

function fill(values: RetentionSettings): void { Object.assign(form, values); }

const hasChanges = computed(() => {
  const values = snapshot.value?.values;
  return Boolean(
    values
    && (
      values.retentionDays !== form.retentionDays
      || values.scriptHistoryLimit !== form.scriptHistoryLimit
      || values.testHistoryLimit !== form.testHistoryLimit
    )
  );
});

useAutoDismiss(error, '');
useAutoDismiss(feedback, '');
useAutoDismiss(notificationFeedback, '');

async function updateNativeNotifications(event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked;
  notificationFeedback.value = '';

  if (!checked) {
    nativeNotificationStore.disable();
    notificationFeedback.value = 'Notificações nativas desativadas.';
    return;
  }

  const result = await nativeNotificationStore.enable();
  if (result === 'enabled') {
    notificationFeedback.value = 'Notificações nativas ativadas.';
  } else if (result === 'denied') {
    notificationFeedback.value = 'A permissão foi negada. Libere as notificações nas configurações do navegador.';
  } else if (result === 'unsupported') {
    notificationFeedback.value = 'Este navegador não oferece notificações nativas.';
  } else {
    notificationFeedback.value = 'Não foi possível ativar as notificações nativas.';
  }
}

async function load(): Promise<void> {
  loading.value = true; error.value = '';
  try { snapshot.value = await fetchRetentionSettings(); fill(snapshot.value.values); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as configurações.'; }
  finally { loading.value = false; }
}

async function save(): Promise<void> {
  saving.value = true; error.value = ''; feedback.value = '';
  try {
    snapshot.value = await updateRetentionSettings({ ...form });
    fill(snapshot.value.values);
    feedback.value = 'Configurações salvas. Reinicie a API para aplicar os novos valores aos gerenciadores.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar as configurações.'; }
  finally { saving.value = false; }
}

const SENSITIVE_VARIABLE_NAME_PATTERN = /SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|_KEY$|^KEY$|APIKEY/i;
function isSensitiveVariableName(name: string): boolean {
  return SENSITIVE_VARIABLE_NAME_PATTERN.test(name);
}

interface ProfileVariableRow { name: string; value: string }

const profileList = ref<EnvironmentProfileList>();
const profilesLoading = ref(true);
const profilesError = ref('');
const profileForm = reactive<{ id: string | undefined; name: string; variables: ProfileVariableRow[] }>({ id: undefined, name: '', variables: [{ name: '', value: '' }] });
const profileSaving = ref(false);

useAutoDismiss(profilesError, '');

async function loadProfiles(): Promise<void> {
  profilesLoading.value = true; profilesError.value = '';
  try { profileList.value = await fetchEnvironmentProfiles(); }
  catch (cause) { profilesError.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os perfis de ambiente.'; }
  finally { profilesLoading.value = false; }
}

function resetProfileForm(): void {
  profileForm.id = undefined;
  profileForm.name = '';
  profileForm.variables = [{ name: '', value: '' }];
}

function editProfile(profile: EnvironmentProfile): void {
  profileForm.id = profile.id;
  profileForm.name = profile.name;
  profileForm.variables = profile.variables.length > 0
    ? profile.variables.map((variable) => ({ name: variable.name, value: variable.value ?? '' }))
    : [{ name: '', value: '' }];
}

function addVariableRow(): void { profileForm.variables.push({ name: '', value: '' }); }
function removeVariableRow(index: number): void { profileForm.variables.splice(index, 1); }

async function saveProfile(): Promise<void> {
  profileSaving.value = true; profilesError.value = '';
  try {
    const input: CreateEnvironmentProfileInput = {
      name: profileForm.name,
      variables: profileForm.variables
        .filter((variable) => variable.name.trim().length > 0)
        .map((variable) => (variable.value.trim().length > 0 ? { name: variable.name.trim(), value: variable.value } : { name: variable.name.trim() })),
    };
    if (profileForm.id) await updateEnvironmentProfile(profileForm.id, input);
    else await createEnvironmentProfile(input);
    resetProfileForm();
    await loadProfiles();
  } catch (cause) { profilesError.value = cause instanceof Error ? cause.message : 'Não foi possível salvar o perfil de ambiente.'; }
  finally { profileSaving.value = false; }
}

async function removeProfile(profile: EnvironmentProfile): Promise<void> {
  profilesError.value = '';
  try {
    await deleteEnvironmentProfile(profile.id);
    if (profileForm.id === profile.id) resetProfileForm();
    await loadProfiles();
  } catch (cause) { profilesError.value = cause instanceof Error ? cause.message : 'Não foi possível remover o perfil de ambiente.'; }
}

onMounted(() => void load());
onMounted(() => void loadProfiles());
</script>

<template>
  <section
    class="content settings-page"
    :aria-busy="loading"
    aria-labelledby="settings-title"
  >
    <header class="settings-heading">
      <div>
        <span class="section-kicker">Ambiente local</span>
        <h2 id="settings-title">Configurações</h2>
        <p class="section-description">
          Ajuste notificações do navegador e defina por quanto tempo estados e logs terminais permanecem locais.
        </p>
      </div>

      <div class="settings-save">
        <button
          class="primary-button settings-save-button"
          type="submit"
          form="retention-settings"
          :disabled="loading || saving || !snapshot || !hasChanges"
        >
          {{ saving ? 'Salvando…' : 'Salvar alterações' }}
        </button>
        <span>{{ hasChanges ? 'Você tem alterações não salvas.' : 'Configurações atualizadas.' }}</span>
      </div>
    </header>

    <LoadingSkeleton
      v-if="loading"
      label="Carregando configurações…"
      :rows="4"
    />

    <form
      v-else-if="snapshot"
      id="retention-settings"
      class="settings-form"
      aria-label="Configurações de notificações e retenção"
      @submit.prevent="save"
    >
      <section class="settings-panel" aria-labelledby="native-notifications-title">
        <header class="settings-section-heading">
          <BellAlertIcon aria-hidden="true" />
          <div>
            <h3 id="native-notifications-title">Notificações do navegador</h3>
            <p>Receba um aviso fora da aba quando uma execução demorada terminar.</p>
          </div>
        </header>

        <label class="settings-row">
          <span class="settings-row-copy">
            <strong id="native-notifications-label">Notificações nativas</strong>
            <span id="native-notifications-description">Testes, scripts e builds com pelo menos 30 segundos, somente enquanto esta aba estiver oculta.</span>
            <small v-if="nativeNotificationStatus === 'denied'" id="native-notifications-status">Permissão bloqueada nas configurações do navegador.</small>
            <small v-else-if="nativeNotificationStatus === 'unsupported'" id="native-notifications-status">Recurso indisponível neste navegador.</small>
            <small v-else id="native-notifications-status">A preferência fica salva somente neste navegador.</small>
          </span>
          <span class="settings-switch-control">
            <input
              :checked="nativeNotificationsEnabled"
              :disabled="nativeNotificationStatus === 'unsupported'"
              type="checkbox"
              role="switch"
              aria-labelledby="native-notifications-label"
              aria-describedby="native-notifications-description native-notifications-status"
              @change="updateNativeNotifications"
            >
            <span>{{ nativeNotificationsEnabled ? 'Ativadas' : 'Desativadas' }}</span>
          </span>
        </label>

        <p v-if="notificationFeedback" class="settings-inline-feedback" role="status">
          {{ notificationFeedback }}
        </p>
      </section>

      <section class="settings-panel" aria-labelledby="local-files-title">
        <header class="settings-section-heading">
          <DocumentTextIcon aria-hidden="true" />
          <div>
            <h3 id="local-files-title">Arquivos locais</h3>
            <p>Defina por quanto tempo os arquivos de logs permanecem armazenados localmente.</p>
          </div>
        </header>

        <label class="settings-row" for="retention-days-input">
          <span class="settings-row-copy">
            <strong id="retention-days-label">Retenção de logs</strong>
            <span id="retention-days-description">Tempo que os arquivos de logs permanecem no disco local.</span>
            <small id="retention-days-limits">Entre {{ snapshot.limits.retentionDays.minimum }} e {{ snapshot.limits.retentionDays.maximum }} dias.</small>
          </span>
          <span class="settings-number-control">
            <input
              id="retention-days-input"
              v-model.number="form.retentionDays"
              type="number"
              step="1"
              required
              :min="snapshot.limits.retentionDays.minimum"
              :max="snapshot.limits.retentionDays.maximum"
              aria-labelledby="retention-days-label"
              aria-describedby="retention-days-description retention-days-limits"
            >
            <span aria-hidden="true">dia{{ form.retentionDays === 1 ? '' : 's' }}</span>
          </span>
        </label>

        <div class="settings-section-divider" />

        <header class="settings-section-heading">
          <ClockIcon aria-hidden="true" />
          <div>
            <h3>Limites do histórico</h3>
            <p>Defina a quantidade máxima de registros mantidos em cada histórico.</p>
          </div>
        </header>

        <div class="settings-row-group">
          <label class="settings-row" for="script-history-limit-input">
            <span class="settings-row-copy">
              <strong id="script-history-limit-label">Histórico de scripts</strong>
              <span id="script-history-limit-description">Quantidade máxima de registros mantidos no histórico de scripts.</span>
              <small id="script-history-limit-limits">Entre {{ snapshot.limits.scriptHistoryLimit.minimum }} e {{ snapshot.limits.scriptHistoryLimit.maximum }} registros.</small>
            </span>
            <span class="settings-number-control">
              <input
                id="script-history-limit-input"
                v-model.number="form.scriptHistoryLimit"
                type="number"
                step="1"
                required
                :min="snapshot.limits.scriptHistoryLimit.minimum"
                :max="snapshot.limits.scriptHistoryLimit.maximum"
                aria-labelledby="script-history-limit-label"
                aria-describedby="script-history-limit-description script-history-limit-limits"
              >
              <span aria-hidden="true">registros</span>
            </span>
          </label>

          <label class="settings-row" for="test-history-limit-input">
            <span class="settings-row-copy">
              <strong id="test-history-limit-label">Histórico de testes</strong>
              <span id="test-history-limit-description">Quantidade máxima de registros mantidos no histórico de testes.</span>
              <small id="test-history-limit-limits">Entre {{ snapshot.limits.testHistoryLimit.minimum }} e {{ snapshot.limits.testHistoryLimit.maximum }} registros.</small>
            </span>
            <span class="settings-number-control">
              <input
                id="test-history-limit-input"
                v-model.number="form.testHistoryLimit"
                type="number"
                step="1"
                required
                :min="snapshot.limits.testHistoryLimit.minimum"
                :max="snapshot.limits.testHistoryLimit.maximum"
                aria-labelledby="test-history-limit-label"
                aria-describedby="test-history-limit-description test-history-limit-limits"
              >
              <span aria-hidden="true">registros</span>
            </span>
          </label>
        </div>

        <aside class="settings-notice">
          <ExclamationTriangleIcon aria-hidden="true" />
          <span>
            <strong>Atenção: salvar não remove arquivos.</strong>
            Os novos valores passam a valer após reiniciar a API.
          </span>
        </aside>

        <dl class="settings-summary">
          <div>
            <DocumentTextIcon aria-hidden="true" />
            <div><dt>Logs</dt><dd>{{ form.retentionDays }} dia{{ form.retentionDays === 1 ? '' : 's' }}</dd></div>
          </div>
          <div>
            <CodeBracketIcon aria-hidden="true" />
            <div><dt>Scripts</dt><dd>{{ form.scriptHistoryLimit }} registros</dd></div>
          </div>
          <div>
            <BeakerIcon aria-hidden="true" />
            <div><dt>Testes</dt><dd>{{ form.testHistoryLimit }} registros</dd></div>
          </div>
          <div>
            <ArrowPathIcon aria-hidden="true" />
            <div><dt>Reinício necessário</dt><dd>Sim</dd></div>
          </div>
        </dl>
      </section>

      <p v-if="error" class="alert alert-error settings-feedback" role="alert">{{ error }}</p>
      <p v-if="feedback" class="alert alert-success settings-feedback" role="status">{{ feedback }}</p>
    </form>

    <section class="settings-panel" aria-labelledby="environment-profiles-title">
      <header class="settings-section-heading">
        <KeyIcon aria-hidden="true" />
        <div>
          <h3 id="environment-profiles-title">Perfis de ambiente</h3>
          <p>
            Guarde conjuntos reutilizáveis de variáveis para preencher execuções mais rápido. Variáveis com nome de
            segredo (token, senha, chave, credencial) nunca têm o valor salvo — apenas o nome é lembrado.
          </p>
        </div>
      </header>

      <LoadingSkeleton
        v-if="profilesLoading"
        label="Carregando perfis de ambiente…"
        :rows="2"
      />

      <template v-else-if="profileList">
        <ul v-if="profileList.profiles.length > 0" class="environment-profile-list">
          <li v-for="profile in profileList.profiles" :key="profile.id" class="environment-profile-item">
            <div class="environment-profile-summary">
              <strong>{{ profile.name }}</strong>
              <span>{{ profile.variables.length }} variável{{ profile.variables.length === 1 ? '' : 'is' }}</span>
              <span class="environment-profile-variables">
                <code v-for="variable in profile.variables" :key="variable.name">{{ variable.name }}{{ variable.value !== undefined ? '=…' : '' }}</code>
              </span>
            </div>
            <div class="environment-profile-actions">
              <button type="button" class="secondary-button" @click="editProfile(profile)">Editar</button>
              <button type="button" class="secondary-button" @click="removeProfile(profile)">
                <TrashIcon aria-hidden="true" />
                Remover
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="settings-empty">Nenhum perfil de ambiente cadastrado ainda.</p>

        <form class="environment-profile-form" aria-label="Criar ou editar perfil de ambiente" @submit.prevent="saveProfile">
          <label class="settings-row" for="environment-profile-name-input">
            <span class="settings-row-copy">
              <strong id="environment-profile-name-label">{{ profileForm.id ? 'Editar perfil' : 'Novo perfil' }}</strong>
              <span>Nome do perfil</span>
            </span>
            <input
              id="environment-profile-name-input"
              v-model="profileForm.name"
              type="text"
              required
              maxlength="100"
              aria-labelledby="environment-profile-name-label"
            >
          </label>

          <div v-for="(variable, index) in profileForm.variables" :key="index" class="environment-profile-variable-row">
            <input v-model="variable.name" type="text" placeholder="NOME_DA_VARIAVEL" maxlength="128" :aria-label="`Nome da variável ${index + 1}`">
            <input
              v-model="variable.value"
              type="text"
              :placeholder="isSensitiveVariableName(variable.name) ? 'não será salvo (nome de segredo)' : 'valor (opcional)'"
              :disabled="isSensitiveVariableName(variable.name)"
              maxlength="4096"
              :aria-label="`Valor da variável ${index + 1}`"
            >
            <button type="button" class="secondary-button" :disabled="profileForm.variables.length <= 1" @click="removeVariableRow(index)">
              <TrashIcon aria-hidden="true" />
            </button>
          </div>

          <button type="button" class="secondary-button" @click="addVariableRow">
            <PlusIcon aria-hidden="true" />
            Adicionar variável
          </button>

          <div class="environment-profile-form-actions">
            <button type="submit" class="primary-button" :disabled="profileSaving || !profileForm.name.trim()">
              {{ profileSaving ? 'Salvando…' : profileForm.id ? 'Salvar alterações' : 'Criar perfil' }}
            </button>
            <button v-if="profileForm.id" type="button" class="secondary-button" @click="resetProfileForm">Cancelar edição</button>
          </div>
        </form>
      </template>

      <p v-if="profilesError" class="alert alert-error settings-feedback" role="alert">{{ profilesError }}</p>
    </section>
  </section>
</template>
